const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwksf1Xka-AES0ym0TGdQbzLyHeEFN-RhSxG3201rYFppvb7fvRCBjjD3CPGYonUPA/exec'; 

    let currentUser = ""; let currentPass = ""; let loginUserGlobal = "";

    async function callAPI(payload) {
        document.getElementById('loading-overlay').style.display = 'flex';
        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            document.getElementById('loading-overlay').style.display = 'none';
            return result;
        } catch (error) {
            document.getElementById('loading-overlay').style.display = 'none';
            alert("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ ลองรีเฟรชหน้าเว็บอีกครั้ง");
            return { success: false, message: "Connection Error" };
        }
    }

    async function attemptLogin() {
        if (loginInProgress) return;
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value.trim();
        const errLabel = document.getElementById('login-err');
        if (!u || !p) { errLabel.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบ'; return; }
        loginInProgress = true;
        const button = document.getElementById('login-submit');
        button.disabled = true; button.textContent = 'กำลังตรวจสอบรหัส…'; errLabel.textContent = '';
        const res = await callAPI({ action: 'login', username: u, password: p });
        loginInProgress = false; button.disabled = false; button.textContent = 'เข้าสู่ระบบ';
        if (res.success) {
            document.getElementById('login-view').style.display = 'none'; loginUserGlobal = u;
            document.getElementById('login-pass').value = '';
            if (res.role === 'admin') {
                currentUser = u; currentPass = p;
                document.getElementById('admin-view').style.display = 'block'; fetchTokenList();
            } else {
                document.getElementById('tarot-view').style.display = 'block'; setStage('intro');
                document.getElementById('flow-heading').focus();
            }
        } else {
            errLabel.textContent = res.message === 'Connection Error' ? 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' : res.message;
        }
    }

    async function generateToken(isCustom) {
        let payload = { action: "generate", adminUser: currentUser, adminPass: currentPass };
        if (isCustom) {
            let u = document.getElementById('custom-u').value.trim();
            let p = document.getElementById('custom-p').value.trim();
            if(!u || !p) { alert("กรุณากรอก Username และ Password ที่ต้องการสร้าง"); return; }
            payload.newUsername = u; payload.newPassword = p;
        }
        const res = await callAPI(payload);
        const msg = document.getElementById('admin-msg');
        if(res.success) {
            msg.style.color = "#27ae60"; msg.innerText = `✅ สร้างรหัสสำเร็จ! User: ${res.username} / Pass: ${res.password}`;
            document.getElementById('custom-u').value = ""; document.getElementById('custom-p').value = "";
            fetchTokenList(); 
        } else {
            msg.style.color = "#e74c3c"; msg.innerText = `❌ ผิดพลาด: ${res.message}`;
        }
    }

    async function fetchTokenList() {
        const res = await callAPI({ action: "list", adminUser: currentUser, adminPass: currentPass });
        if(res.success) {
            let html = `<table><tr><th>วันที่สร้าง</th><th>Username</th><th>Password</th><th>สถานะ</th></tr>`;
            res.data.forEach(r => {
                let statusClass = r.status === "Ready" ? "status-ready" : "status-used";
                let statusText = r.status === "Ready" ? "✅ พร้อมใช้" : "❌ ใช้แล้ว";
                html += `<tr><td>${r.time}</td><td>${r.user}</td><td>${r.pass}</td><td class="${statusClass}">${statusText}</td></tr>`;
            });
            html += `</table>`;
            document.getElementById('table-container').innerHTML = html;
        }
    }

    const CARD_DATA = {
        101:"เทพพระอาทิตย์", 102:"เทพพระจันทร์", 103:"เทพพระอังคาร", 104:"เทพพระพุธ", 105:"เทพพระพฤหัสบดี", 106:"เทพพระศุกร์", 107:"เทพพระเสาร์",
        201:"พระรามแผลงศร", 202:"ขงเบ้ง", 203:"พระแม่คงคา", 204:"พระนางสุพรรณมัจฉา", 205:"พระพาย", 206:"พระกฤษณะ", 207:"ขุนแผนกับนางพิมฯ", 208:"พญาพาลีจับปูทศกันฐ์", 209:"พญาราชสีห์", 210:"นางสีดา", 211:"เทพบุตรยุติธรรม", 212:"เทพธิดาแมงป่อง",
        301:"พระพิฆเนศทรงหนู", 302:"พระโคนนทิ", 303:"พระแม่อุมา", 304:"เทพธิดาพระจันทร์", 305:"พระนารายณ์บรรทมสินธุ์", 306:"ท้าววิรูปักษ์", 307:"พระอรุณเทพบุตร", 308:"พระทักษะ", 309:"หนุมาน", 310:"พญาสุครีพ", 311:"กุมารทอง", 312:"พระนางเบญจกัลยาณี",
        401:"พระเพลิง", 402:"พระแม่ปาราวตี", 403:"พระขันธกุมาร", 404:"พระพิรุณ", 405:"พระพรหมฤาษี", 406:"พระนางสุรัสวดี", 407:"ท้าววิรุฬหก", 408:"พระอสุรินทร์ราหู", 409:"พระเกตุมงคล", 410:"ท้าวเวสสุวรรณ", 411:"พระพิฆเนศ", 412:"พระราหู", 413:"พระศิวะ", 414:"พระอินทร์", 415:"พระลักษมี", 416:"ท้าวธตรฐ", 417:"พระวิษณุกรม", 418:"พระนารายณ์ทรงสุบรรณ", 419:"พระเทวฤาษี", 420:"รจนากับสังข์ทอง", 421:"พระแม่ธรณี", 422:"พระรามกับสีดา", 423:"พญาครุฑกับนางกากี", 424:"พระแม่โพสพ", 425:"หนุมานกับนางเบญจกาย", 426:"กามเทพ", 427:"เมขลากับรามสูร", 428:"พรานบุญจับนางโมราห์", 429:"พระแม่นางกวัก", 430:"ทศกัณฐ์ออกรบ", 431:"พระยายมราช", 432:"โมรา", 433:"ไกรทองปราบชาละวัน", 434:"พระอภัยมณีกับนางผีเสื้อสมุทร", 435:"ความไม่เที่ยง", 436:"สัจธรรม"
    };

    const EXTRA_CARD_IDS = [201, 208, 211];
    const POS_3 = ["ไพ่สำคัญ", "ความรู้สึก", "คำแนะนำ", "ขยายความ", "ขยายความ", "ขยายความ"];
    const POS_12 = ["พื้นดวง", "ทรัพย์สิน", "บ้านช่อง", "ญาติ", "บริวาร", "ศัตรู", "คู่ครอง", "โรคภัย", "ความสุข", "การงาน", "โชคลาภ", "สรุปดวงชะตา"];

    const IMAGE_PATH = 'images/'; 
    const IMAGE_EXT = '.jpg'; 
    const gridLayoutMap12 = ["pos-D1", "pos-C2", "pos-E2", "pos-B3", "pos-F3", "pos-A4", "pos-G4", "pos-F4", "pos-E4", "pos-C4", "pos-B4", "pos-D3"];
    
    const VERY_GOOD = ["101", "409", "411", "424"];
    const GOOD = ["104", "105", "106", "201", "202", "203", "204", "206", "207", "301", "304", "307", "312", "402", "404", "405", "406", "410", "414", "415", "416", "417", "418", "419", "421", "422", "426", "429"];
    const NEUTRAL = ["102", "209", "210", "211", "303", "305", "309", "311", "403", "407", "420", "435", "436"];
    const BAD = ["103", "107", "205", "208", "212", "302", "306", "308", "310", "413", "423", "425", "427", "428", "430", "432", "433", "434"];
    const VERY_BAD = ["401", "408", "412", "431"];
    const ALERT_POSITIONS = ["ศัตรู", "โรคภัย"];
    const WEALTH_CARDS = ["410", "411", "415", "416", "424", "429"];
    const WEALTH_POSITIONS = ["ทรัพย์สิน", "บ้านช่อง", "ลาภยศ", "ความสุข", "พื้นดวง", "สรุปดวงชะตา", "สรุป"];

    // 🌟 กฎความสัมพันธ์ของไพ่ (แบบกลุ่ม) สามารถคลิกใบใดก็ได้ในกลุ่ม
    const dayLogic = {
        'Sun': [ ['พื้นดวง', 'บริวาร'], ['ทรัพย์สิน', 'ศัตรู', 'ความสุข'], ['บ้านช่อง', 'คู่ครอง'], ['ญาติ', 'สรุปดวงชะตา'] ],
        'Mon': [ ['พื้นดวง', 'บริวาร', 'โรคภัย'], ['ทรัพย์สิน', 'ศัตรู'], ['บ้านช่อง', 'โชคลาภ'] ],
        'Tue': [ ['พื้นดวง', 'บริวาร'], ['ทรัพย์สิน', 'การงาน'], ['คู่ครอง', 'โรคภัย'] ],
        'Wed': [ ['พื้นดวง', 'ความสุข'], ['บ้านช่อง', 'สรุปดวงชะตา'] ],
        'Thu': [ ['ทรัพย์สิน', 'โชคลาภ'], ['บริวาร', 'สรุปดวงชะตา'], ['คู่ครอง', 'ความสุข'] ],
        'Fri': [ ['พื้นดวง', 'การงาน'], ['บ้านช่อง', 'คู่ครอง'], ['ญาติ', 'โชคลาภ'], ['ศัตรู', 'โรคภัย'] ],
        'Sat': [ ['ทรัพย์สิน', 'ศัตรู'], ['บ้านช่อง', 'คู่ครอง', 'การงาน'] ]
    };

    let currentMode = 12; let selectedCards = []; let maxAllowed = 12;
    let deck = Object.keys(CARD_DATA).map(Number);
    let isNumbersVisible = true; 
    let activeDayMode = null;
    let selectionLocked = false;
    let saveInProgress = false;
    let lastSaveSucceeded = false;
    let currentStage = 'intro';
    let loginInProgress = false;

    function setDialog(id, open) {
        document.getElementById(id).style.display = open ? 'flex' : 'none';
        document.getElementById('tarot-content').inert = open;
        if (open) document.querySelector(`#${id} button`).focus();
    }

    function setStage(stage) {
        currentStage = stage;
        const names = { intro: 'เริ่มต้นเปิดไพ่พรหมญาณ 12 ใบ', details: currentMode === 12 ? 'ระบุข้อมูลเพิ่มเติม (ข้ามได้)' : 'ระบุคำถามสำหรับไพ่ 3 ใบ', select: `เลือกไพ่${currentMode === 12 ? ' 12 ใบ' : 'สำหรับคำถามของคุณ'}`, result: 'ผลไพ่ของคุณ' };
        document.getElementById('flow-heading').textContent = names[stage];
        const order = ['intro', 'details', 'select', 'result'];
        document.querySelectorAll('.journey li').forEach(item => {
            item.classList.toggle('is-complete', order.indexOf(item.dataset.step) < order.indexOf(stage));
            if (item.dataset.step === stage) item.setAttribute('aria-current', 'step');
            else item.removeAttribute('aria-current');
        });
    }

    function updateSelection() {
        const count = selectedCards.length;
        const complete = count === maxAllowed;
        document.getElementById('selection-count').textContent = `เลือกแล้ว ${count} จาก ${maxAllowed} ใบ`;
        const progress = document.getElementById('selection-progress');
        progress.setAttribute('aria-valuemax', String(maxAllowed));
        progress.setAttribute('aria-valuenow', String(count));
        document.getElementById('selection-progress-fill').style.width = `${count / maxAllowed * 100}%`;
        const next = (currentMode === 12 ? POS_12 : POS_3)[count] || 'ขยายความ';
        document.getElementById('status-msg').textContent = complete ? 'เลือกครบแล้ว ตรวจสอบลำดับก่อนกดยืนยัน คุณยังแตะไพ่ที่เลือกเพื่อเปลี่ยนได้' : `ใบถัดไป: ${next} — เลือกเพิ่มอีก ${maxAllowed - count} ใบ`;
        document.getElementById('confirm-selection').disabled = !complete || selectionLocked;
        document.getElementById('confirm-help').textContent = currentMode === 12 ? 'เมื่อยืนยัน ระบบจะเปิดผลและบันทึกการใช้สิทธิ์ 12 ใบ' : 'เมื่อยืนยัน ระบบจะเปิดผลและบันทึกคำถามนี้';
        document.querySelectorAll('#card-board .card').forEach(card => {
            const index = selectedCards.indexOf(Number(card.dataset.cardId));
            card.classList.toggle('selected', index >= 0);
            card.setAttribute('aria-pressed', String(index >= 0));
            card.setAttribute('aria-label', `ไพ่ตำแหน่ง ${card.dataset.originalNumber}${index >= 0 ? ` เลือกเป็นใบที่ ${index + 1} แตะเพื่อยกเลิก` : ' แตะเพื่อเลือก'}`);
            card.disabled = selectionLocked || (complete && index < 0);
            card.innerHTML = index >= 0 ? String(index + 1) : `<span class="card-bg-number">${card.dataset.originalNumber}</span>`;
        });
    }

    function continueToSelection() {
        if (selectionLocked) return;
        const question = document.getElementById('user-question-3');
        if (currentMode === 3 && !question.value.trim()) {
            document.getElementById('question-error').textContent = 'กรุณาระบุคำถามก่อนเลือกไพ่';
            question.setAttribute('aria-invalid', 'true'); question.focus(); return;
        }
        document.getElementById('question-error').textContent = '';
        question.removeAttribute('aria-invalid');
        document.getElementById('user-info-12').style.display = 'none';
        document.getElementById('question-block').style.display = 'none';
        document.getElementById('details-actions').style.display = 'none';
        document.getElementById('selection-tools').style.display = 'block';
        document.getElementById('card-board').style.display = 'grid';
        document.getElementById('selection-title').textContent = currentMode === 12 ? 'เลือกไพ่ 12 ใบ' : 'เลือกไพ่ 3 ใบ และไพ่ขยายความหากได้รับ';
        setStage('select'); updateSelection(); document.getElementById('flow-heading').focus();
    }

    function backToDetails() {
        if (selectionLocked) return;
        document.getElementById('selection-tools').style.display = 'none';
        document.getElementById('user-info-12').style.display = currentMode === 12 ? 'block' : 'none';
        document.getElementById('question-block').style.display = currentMode === 3 ? 'block' : 'none';
        document.getElementById('details-actions').style.display = 'block';
        setStage('details'); document.getElementById('flow-heading').focus();
    }

    function logout() {
        if (saveInProgress) { alert('กำลังบันทึกผล กรุณารอให้เสร็จก่อนออกจากระบบ'); return; }
        if ((selectedCards.length || currentStage === 'result') && !confirm('ก่อนออกจากระบบ กรุณาคัดลอกผลหรือบันทึกภาพ หากใช้สิทธิ์ 12 ใบแล้วจะเข้าสู่ระบบใหม่ด้วยรหัสเดิมไม่ได้ ต้องการออกจากระบบหรือไม่?')) return;
        location.reload();
    } 


    function startFlow(mode) {
        currentMode = mode; maxAllowed = mode;
        setDialog('prayer-overlay', true);
    }

    function acceptPrayer() {
        setDialog('prayer-overlay', false);
        document.getElementById('main-controls').style.display = 'none';
        document.getElementById('card-selection-area').style.display = 'block';
        resetReading(); backToDetails();
    }

    function resetReading() {
        selectedCards = []; maxAllowed = currentMode; selectionLocked = false;
        lastSaveSucceeded = false;
        document.getElementById('result-area').style.display = 'none';
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        renderBoard(); updateSelection();
    }

    function startFlow3Cards() {
        if (saveInProgress || !lastSaveSucceeded) return;
        if (!confirm('ก่อนถามต่อ กรุณาคัดลอกผลหรือบันทึกภาพชุดปัจจุบันไว้ หน้านี้จะแสดงผลชุดใหม่แทน ต้องการถามต่อหรือไม่?')) return;
        currentMode = 3;
        document.getElementById('user-question-3').value = '';
        document.getElementById('question-error').textContent = '';
        document.getElementById('card-selection-area').style.display = 'block';
        resetReading(); backToDetails(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function closeExtraPopup() {
        setDialog('extra-card-popup', false);
        document.getElementById('selection-count').scrollIntoView({ block: 'center', behavior: 'smooth' });
        const nextCard = document.querySelector('#card-board .card:not(.selected)');
        if (nextCard) nextCard.focus({ preventScroll: true });
    }

    function toggleNumbers() {
        isNumbersVisible = !isNumbersVisible;
        const board = document.getElementById('card-board'); const btnToggle = document.getElementById('btn-toggle-num');
        if (isNumbersVisible) { board.classList.remove('hide-numbers'); btnToggle.innerHTML = "👁️ ปิดตำแหน่งไพ่"; btnToggle.style.background = "#e67e22"; } 
        else { board.classList.add('hide-numbers'); btnToggle.innerHTML = "👁️ เปิดตำแหน่งไพ่"; btnToggle.style.background = "#27ae60"; }
    }

    function shuffleAndReset() {
        if (selectionLocked) return;
        if (selectedCards.length && !confirm('การสับไพ่จะล้างไพ่ที่เลือกไว้และเริ่มเลือกใหม่ ต้องการสับไพ่หรือไม่?')) return;
        resetReading();
    }

    function renderBoard() {
        const board = document.getElementById('card-board'); board.innerHTML = '';
        board.classList.toggle('hide-numbers', !isNumbersVisible);
        deck.forEach((cardId, index) => {
            const card = document.createElement('button');
            card.type = 'button'; card.className = 'card'; card.id = `client-card-${cardId}`;
            card.dataset.cardId = String(cardId); card.dataset.originalNumber = String(index + 1);
            card.onclick = () => selectCard(cardId, card); board.appendChild(card);
        });
    }

    function selectCard(cardId, element) {
        if (selectionLocked || currentStage !== 'select') return;
        const existing = selectedCards.indexOf(cardId);
        if (existing >= 0) {
            selectedCards.splice(existing, 1);
            if (currentMode === 3) maxAllowed = Math.min(6, 3 + selectedCards.slice(2).filter(id => EXTRA_CARD_IDS.includes(id)).length);
            updateSelection(); return;
        }
        if (selectedCards.length >= maxAllowed) return;
        selectedCards.push(cardId);
        if (currentMode === 3 && selectedCards.length >= 3 && selectedCards.length <= 5 && EXTRA_CARD_IDS.includes(cardId)) {
            maxAllowed++;
            document.getElementById('extra-card-message').textContent = `คุณได้ไพ่พิเศษ รับไพ่ขยายความเพิ่ม 1 ใบ ตอนนี้ต้องเลือกทั้งหมด ${maxAllowed} ใบ`;
            setDialog('extra-card-popup', true);
        }
        updateSelection();
        if (selectedCards.length === maxAllowed) document.getElementById('confirm-selection').focus();
    }

    function autoPickCards() {
        if (selectionLocked || currentStage !== 'select' || selectedCards.length === maxAllowed) return;
        const remaining = deck.filter(id => !selectedCards.includes(id));
        for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        while (selectedCards.length < maxAllowed) {
            const cardId = remaining.pop(); selectedCards.push(cardId);
            if (currentMode === 3 && selectedCards.length >= 3 && selectedCards.length <= 5 && EXTRA_CARD_IDS.includes(cardId)) maxAllowed++;
        }
        updateSelection();
        if (currentMode === 3 && maxAllowed > 3) document.getElementById('status-msg').textContent = `พบไพ่พิเศษ ระบบเลือกไพ่ขยายความเพิ่มให้แล้ว รวม ${maxAllowed} ใบ กรุณายืนยันเพื่อเปิดผล`;
        document.getElementById('confirm-selection').focus();
    }

    async function showResults() {
        if (selectionLocked || currentStage !== 'select' || selectedCards.length !== maxAllowed) return;
        selectionLocked = true; saveInProgress = true; lastSaveSucceeded = false; updateSelection();
        document.getElementById('card-selection-area').style.display = 'none';
        const resArea = document.getElementById('result-area');
        const list = document.getElementById('selected-list'); list.innerHTML = '';
        const positions = currentMode === 3 ? POS_3 : POS_12;
        selectedCards.forEach((id, index) => {
            const row = document.createElement('div'); row.className = 'result-item';
            const label = document.createElement('span'); label.className = 'pos-title';
            label.textContent = `${index + 1}. ${positions[index] || 'ขยายความ'}:`;
            const name = document.createElement('span'); name.className = 'card-highlight';
            name.textContent = `${id} ${CARD_DATA[id]}`; row.append(label, name); list.appendChild(row);
        });
        resArea.style.display = 'block'; renderVisualCards(); setStage('result');
        const saveStatus = document.getElementById('save-status');
        saveStatus.className = 'save-status'; saveStatus.textContent = 'กำลังบันทึกผล กรุณารอสักครู่และอย่าปิดหน้านี้…';
        const followUp = document.getElementById('follow-up-button'); followUp.disabled = true;
        document.getElementById('result-heading').focus();
        resArea.scrollIntoView({ behavior: 'smooth' });
        try {
            const response = await saveDataToSheet();
            if (!response.success) throw new Error('Save was not confirmed');
            lastSaveSucceeded = true; followUp.disabled = false;
            saveStatus.className = 'save-status saved';
            saveStatus.textContent = currentMode === 12 ? 'บันทึกผลสำเร็จ ใช้สิทธิ์เปิดไพ่ 12 ใบแล้ว คุณบันทึกผลและถามต่อแบบ 3 ใบในหน้านี้ได้' : 'บันทึกคำถามและผลไพ่สำเร็จ คุณบันทึกผลหรือถามคำถามถัดไปได้';
        } catch (error) {
            saveStatus.className = 'save-status field-error';
            saveStatus.textContent = 'ยังยืนยันการบันทึกไม่ได้ กรุณาคัดลอกผลหรือบันทึกภาพชุดนี้ แล้วติดต่อหมอวิทยาก่อนเริ่มใหม่ เพื่อป้องกันการใช้สิทธิ์หรือบันทึกซ้ำ';
        } finally { saveInProgress = false; }
    }

    function filterCards(type, skipDayReset = false) {
        if (!skipDayReset) {
            activeDayMode = null; 
            document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        }
        
        const cards = document.querySelectorAll('#card-area .card-item');
        
        cards.forEach(card => {
            card.classList.remove('faded', 'linked');
            if (!skipDayReset) card.classList.remove('linkable'); 
            
            const id = card.dataset.id;
            let show = false;
            
            if (type === 'good') show = VERY_GOOD.includes(id) || GOOD.includes(id);
            else if (type === 'bad') show = VERY_BAD.includes(id) || BAD.includes(id);
            else if (type === 'reset') show = true;
            
            if (!show) { card.classList.add('faded'); }
        });
    }

    function setDayMode(day, btn) {
        activeDayMode = day;
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        if(btn) btn.classList.add('active');
        
        filterCards('reset', true); 
        activeDayMode = day; 

        if (activeDayMode && dayLogic[activeDayMode]) {
            const allLinkablePos = dayLogic[activeDayMode].flat();
            const cards = document.querySelectorAll('#card-area .card-item');
            cards.forEach(card => {
                if (allLinkablePos.includes(card.dataset.pos)) {
                    card.classList.add('linkable');
                } else {
                    card.classList.remove('linkable');
                }
            });
        }
    }

    function handleCardClick(posName) {
        if (!activeDayMode) return;
        const logic = dayLogic[activeDayMode];
        if (!logic) return;

        const targetGroup = logic.find(group => group.includes(posName));
        if (!targetGroup) return; 

        const cards = document.querySelectorAll('#card-area .card-item');
        cards.forEach(card => {
            card.classList.remove('faded', 'linked');
            if (targetGroup.includes(card.dataset.pos)) {
                card.classList.add('linked'); 
            } else {
                card.classList.add('faded'); 
            }
        });
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function renderVisualCards() {
        const resultDisplay = document.getElementById('result-display');
        const displayQuestion = document.getElementById('display-question');
        const contextDisplay = document.getElementById('user-context-display');
        const cardArea = document.getElementById('card-area');
        const masterArea = document.getElementById('master-cards-area');
        const filterControls = document.getElementById('filter-controls');

        cardArea.innerHTML = ""; masterArea.innerHTML = ""; contextDisplay.innerHTML = "";
        contextDisplay.style.display = 'none'; resultDisplay.style.display = 'block';

        if (currentMode === 12) { filterControls.style.display = 'flex'; } 
        else { filterControls.style.display = 'none'; }

        for (let i = 501; i <= 506; i++) {
            masterArea.innerHTML += `<div class="master-card"><img src="${IMAGE_PATH}${i}${IMAGE_EXT}" crossorigin="anonymous" alt="ภาพไพ่"></div>`;
        }

        let situationText = ""; let questionText = "";

        if (currentMode === 12) {
            situationText = document.getElementById('user-context').value.trim();
            questionText = document.getElementById('user-question-12').value.trim();
            
            const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
            const currentDate = new Date(); const currentMonthIndex = currentDate.getMonth(); 
            const month1 = thaiMonths[(currentMonthIndex + 1) % 12];
            const month2 = thaiMonths[(currentMonthIndex + 2) % 12];
            const month3 = thaiMonths[(currentMonthIndex + 3) % 12];
            displayQuestion.innerHTML = `🌟 <b>ไพ่พรหมญาณ 12 ใบ : พื้นดวงชะตาระยะสั้น (ปัจจุบัน - 3 เดือน) : <span style="color: #4a4a4a;">${month1} - ${month2} - ${month3}</span></b>`;
        } else {
            questionText = document.getElementById('user-question-3').value.trim();
            displayQuestion.innerHTML = `❓ <b>คำถาม:</b> ${escapeHTML(questionText || "ดูดวงภาพรวม")}`;
        }

        let contextHTML = "";
        if (situationText) { contextHTML += `<p><span class="context-label">📌 สถานการณ์:</span> ${escapeHTML(situationText).replace(/\n/g, '<br>')}</p>`; }
        if (currentMode === 12 && questionText && questionText !== "วิเคราะห์พื้นดวงชะตา") {
            contextHTML += `<p><span class="context-label">❓ คำถามเพิ่มเติม:</span> <br>${escapeHTML(questionText).replace(/\n/g, '<br>')}</p>`;
        }
        if (contextHTML !== "") { contextDisplay.innerHTML = contextHTML; contextDisplay.style.display = 'block'; }

        if (currentMode === 12) cardArea.className = 'custom-layout-12';
        else cardArea.className = 'custom-layout-3to6';

        const posNames = (currentMode === 3) ? POS_3 : POS_12;

        selectedCards.forEach((cardId, index) => {
            let posPart = posNames[index] || 'ขยายความ';
            let strCardId = String(cardId);
            let cardClass = "card-item"; let labelClass = "pos-label";

            if (ALERT_POSITIONS.includes(posPart)) {
                if (VERY_GOOD.includes(strCardId) || GOOD.includes(strCardId)) { cardClass += " alert-good"; } 
                else if (NEUTRAL.includes(strCardId)) { cardClass += " alert-neutral"; } 
                else { cardClass += " alert-bad"; }
            } else if (WEALTH_POSITIONS.includes(posPart) && WEALTH_CARDS.includes(strCardId)) {
                cardClass += " card-gold-zone"; 
            } else if (VERY_BAD.includes(strCardId)) { cardClass += " card-very-bad"; } 
            else if (BAD.includes(strCardId)) { cardClass += " card-bad"; } 
            else if (VERY_GOOD.includes(strCardId)) { cardClass += " card-very-good"; } 
            else if (GOOD.includes(strCardId)) { cardClass += " card-good"; } 
            else { cardClass += " card-neutral"; }

            const cardDiv = document.createElement('div');
            cardDiv.className = cardClass;
            
            cardDiv.dataset.pos = posPart;
            cardDiv.dataset.id = strCardId;

            if (currentMode === 12) {
                cardDiv.classList.add(gridLayoutMap12[index]);
                cardDiv.onclick = () => handleCardClick(posPart); 
                cardDiv.style.cursor = 'pointer';
            }

            cardDiv.innerHTML = `
                <div class="link-badge">🔗</div>
                <span class="${labelClass}">${posPart}</span>
                <img src="${IMAGE_PATH}${cardId}${IMAGE_EXT}" crossorigin="anonymous" alt="ภาพไพ่">
            `;
            cardArea.appendChild(cardDiv);
        });

        filterCards('reset');
    }

    async function saveAsImage() {
        const button = document.getElementById('btnSaveImg');
        if (button.disabled) return;
        button.disabled = true; button.textContent = 'กำลังสร้างภาพ…';
        let exportArea;
        try {
            if (typeof html2canvas !== 'function') throw new Error('Image exporter unavailable');
            await document.fonts.ready;
            exportArea = document.getElementById('capture-area').cloneNode(true);
            exportArea.style.cssText = 'position:absolute;left:-10000px;top:0;width:1000px;max-width:none;padding:30px;background:white;overflow:visible;';
            document.body.appendChild(exportArea);
            await Promise.all(Array.from(exportArea.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
            const canvas = await html2canvas(exportArea, { useCORS: true, scale: 2, backgroundColor: '#ffffff', windowWidth: 1200 });
            const link = document.createElement('a');
            link.download = 'ผลการทำนาย-หมอวิทยา.png';
            link.href = canvas.toDataURL("image/png");
            link.click();
            document.getElementById('copy-status').textContent = 'สร้างภาพผลไพ่แล้ว กรุณาตรวจดูรายการดาวน์โหลดของคุณ';
        } catch (error) {
            document.getElementById('copy-status').textContent = 'บันทึกภาพไม่สำเร็จ กรุณาลองอีกครั้ง หรือใช้ปุ่มคัดลอกผลไพ่';
        } finally {
            if (exportArea) exportArea.remove();
            button.disabled = false; button.textContent = 'บันทึกภาพผลไพ่';
        }
    }

    function copyResult() {
        let textToCopy = `🔮 ผลการเลือกไพ่พรหมญาณ\n🔮 รูปแบบ : แบบ ${currentMode} ใบ\n--------------------------\n`;
        if (currentMode === 12) {
            const contextText = document.getElementById('user-context').value.trim(); const questionText = document.getElementById('user-question-12').value.trim();
            if (contextText || questionText) {
                textToCopy += `📝 ข้อมูลจากเจ้าชะตา:\n`;
                if (contextText) textToCopy += `สถานการณ์: ${contextText}\n`;
                if (questionText) textToCopy += `❓ คำถาม: ${questionText}\n`;
            } else { textToCopy += `❓ คำถาม: วิเคราะห์พื้นดวงชะตา\n`; }
        } else {
            textToCopy += `❓ คำถาม: ${document.getElementById('user-question-3').value.trim()}\n`;
        }
        textToCopy += `--------------------------\n`;
        const posNames = (currentMode === 3) ? POS_3 : POS_12;
        selectedCards.forEach((id, index) => { textToCopy += `${index + 1}. ${posNames[index] || 'ขยายความ'}: ${id} ${CARD_DATA[id]}\n`; });
        navigator.clipboard.writeText(textToCopy).then(() => { 
            document.getElementById('copy-status').innerText = "✅ คัดลอกข้อความเรียบร้อยแล้ว!"; 
            setTimeout(() => { document.getElementById('copy-status').innerText = ""; }, 4000);
        }).catch(() => {
            document.getElementById('copy-status').textContent = 'คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกและคัดลอกข้อความจากรายการไพ่ด้านบน';
        });
    }

    async function saveDataToSheet() {
        let typeLabel = (currentMode === 12) ? "12 ใบ" : "3 ใบ";
        let questionData = "";
        
        if (currentMode === 12) {
            let ctx = document.getElementById('user-context')?.value.trim() || "";
            let q12 = document.getElementById('user-question-12')?.value.trim() || "";
            questionData = `สถานการณ์: ${ctx} | คำถาม: ${q12 || 'วิเคราะห์พื้นดวงชะตา'}`;
        } else {
            questionData = document.getElementById('user-question-3')?.value.trim() || "";
        }

        let fullPattern = `🔮 ผลการเลือกไพ่พรหมญาณ\n🔮 รูปแบบ : แบบ ${currentMode} ใบ\n--------------------------\n`;
        
        if (currentMode === 12) {
            const ctxText = document.getElementById('user-context').value.trim();
            const q12Text = document.getElementById('user-question-12').value.trim();
            if (ctxText || q12Text) {
                fullPattern += `📝 ข้อมูลจากเจ้าชะตา:\n`;
                if (ctxText) fullPattern += `สถานการณ์: ${ctxText}\n`;
                if (q12Text) fullPattern += `❓ คำถาม: ${q12Text}\n`;
            } else { fullPattern += `❓ คำถาม: วิเคราะห์พื้นดวงชะตา\n`; }
        } else {
            const q3Text = document.getElementById('user-question-3').value.trim();
            fullPattern += `❓ คำถาม: ${q3Text}\n`;
        }
        
        fullPattern += `--------------------------\n`;
        const posNames = (currentMode === 3) ? POS_3 : POS_12;
        selectedCards.forEach((id, index) => { fullPattern += `${index + 1}. ${posNames[index] || 'ขยายความ'}: ${id} ${CARD_DATA[id]}\n`; });

        let cardIds = selectedCards.join(", ");
        const payload = {
            action: "saveResult", username: loginUserGlobal, type: typeLabel,
            question: questionData, cards: cardIds, fullPattern: fullPattern
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Unable to confirm save');
        return await response.json();
    }

    document.getElementById('login-form').addEventListener('submit', event => { event.preventDefault(); attemptLogin(); });
    document.getElementById('show-password').addEventListener('change', event => {
        document.getElementById('login-pass').type = event.target.checked ? 'text' : 'password';
    });
    document.getElementById('user-question-3').addEventListener('input', event => {
        if (event.target.value.trim()) {
            document.getElementById('question-error').textContent = '';
            event.target.removeAttribute('aria-invalid');
        }
    });
