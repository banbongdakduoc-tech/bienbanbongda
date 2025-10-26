// ================== Utilities ==================
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const toast = (msg)=>{
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),2000);
};

// LocalStorage key
const TEAM_KEY = 'matchReportTeams_v4_signature';

// State (trận hiện tại)
let teamsDB = []; // {id,name,note,players:[{number,name}]}
let matchState = {
  teamA: null,
  teamB: null,
  datetime: null,
  location: '',
  goals: [], // {minute, teamId, playerName, playerNumber, note}
  cards: [], // {minute, teamId, playerName, playerNumber, type}
  referee: '',
  captainA: '',
  captainB: '',
  signatures: {
    A: '', // base64 ký đội A
    B: '', // base64 ký đội B
    R: ''  // base64 ký trọng tài
  }
};

// Signature pad store
const sigPads = {}; // { key: {canvas, ctx, drawing, lastX, lastY, clearFn} }

// ================== Load / Save Teams ==================
function loadTeamsFromStorage(){
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    teamsDB = raw ? JSON.parse(raw) : [];
  } catch(e){
    teamsDB = [];
  }
}
function saveTeamsToStorage(){
  localStorage.setItem(TEAM_KEY, JSON.stringify(teamsDB));
}

// ================== Team Management UI ==================
function addPlayerRow(numberVal='', nameVal=''){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="inp-number" type="text" placeholder="#10" value="${numberVal}"></td>
    <td><input class="inp-name"   type="text" placeholder="Tên cầu thủ" value="${nameVal}"></td>
    <td><button class="remove-btn">X</button></td>
  `;
  $('#playersTableBody').appendChild(tr);

  tr.querySelector('.remove-btn').addEventListener('click', ()=>{
    tr.remove();
  });
}

function collectPlayersFromTable(){
  const rows = $$('#playersTableBody tr');
  const players = [];
  rows.forEach(r=>{
    const num = r.querySelector('.inp-number').value.trim();
    const nm  = r.querySelector('.inp-name').value.trim();
    if(nm){
      players.push({number:num,name:nm});
    }
  });
  return players;
}

function clearTeamEditor(){
  $('#teamNameInput').value = '';
  $('#teamNoteInput').value = '';
  $('#playersTableBody').innerHTML = '';
  addPlayerRow(); // ít nhất 1 dòng trống
}

function renderSavedTeams(){
  const wrap = $('#savedTeamsList');
  wrap.innerHTML = '';
  teamsDB.forEach(t=>{
    const card = document.createElement('div');
    card.className = 'saved-team-card';
    card.innerHTML = `
      <div class="name">${t.name}</div>
      <div class="mini">${t.note ? t.note : ''}</div>
      <div class="mini">${t.players.length} cầu thủ</div>
      <div class="team-actions">
        <button class="btn ghost small" data-load="${t.id}">📥 Nạp vào form</button>
        <button class="btn ghost small" data-pickA="${t.id}">Chọn làm A</button>
        <button class="btn ghost small" data-pickB="${t.id}">Chọn làm B</button>
        <button class="btn ghost small" data-del="${t.id}">🗑</button>
      </div>
    `;
    wrap.appendChild(card);
  });

  // event
  $$('[data-load]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-load');
      loadTeamIntoEditor(id);
    });
  });

  $$('[data-pickA]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-pickA');
      $('#teamASelect').value = id;
      onTeamSelectionChange();
      toast('Đã set đội A');
    });
  });

  $$('[data-pickB]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-pickB');
      $('#teamBSelect').value = id;
      onTeamSelectionChange();
      toast('Đã set đội B');
    });
  });

  $$('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-del');
      if(confirm('Xóa đội này khỏi danh sách đã lưu?')){
        teamsDB = teamsDB.filter(x=>x.id!==id);
        saveTeamsToStorage();
        renderSavedTeams();
        populateTeamDropdowns();
        toast('Đã xóa đội');
      }
    });
  });
}

function loadTeamIntoEditor(id){
  const t = teamsDB.find(x=>x.id===id);
  if(!t){
    toast('Không tìm thấy đội');
    return;
  }
  $('#teamNameInput').value = t.name;
  $('#teamNoteInput').value = t.note||'';
  $('#playersTableBody').innerHTML = '';
  t.players.forEach(p=> addPlayerRow(p.number,p.name));
  addPlayerRow();
  toast('Đã nạp đội vào form');
}

function handleSaveTeam(){
  const name = $('#teamNameInput').value.trim();
  if(!name){
    toast('Tên đội không được bỏ trống');
    return;
  }
  const note = $('#teamNoteInput').value.trim();
  const players = collectPlayersFromTable();

  // nếu trùng tên -> ghi đè
  let existing = teamsDB.find(t=>t.name.toLowerCase()===name.toLowerCase());
  if(existing){
    existing.note = note;
    existing.players = players;
  } else {
    const id = 'team_'+Math.random().toString(36).slice(2);
    teamsDB.push({id,name,note,players});
  }

  saveTeamsToStorage();
  renderSavedTeams();
  populateTeamDropdowns();
  toast('Đã lưu đội "'+name+'"');
}

// ================== Match Setup ==================
function populateTeamDropdowns(){
  const selA = $('#teamASelect');
  const selB = $('#teamBSelect');
  selA.innerHTML = '<option value="">-- Chọn Đội A --</option>';
  selB.innerHTML = '<option value="">-- Chọn Đội B --</option>';

  teamsDB.forEach(t=>{
    const optA = document.createElement('option');
    optA.value = t.id;
    optA.textContent = t.name;
    selA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = t.id;
    optB.textContent = t.name;
    selB.appendChild(optB);
  });
}

function onTeamSelectionChange(){
  const aId = $('#teamASelect').value;
  const bId = $('#teamBSelect').value;
  matchState.teamA = aId || null;
  matchState.teamB = bId || null;

  updateScoreboardNames();
  refreshEventSelectOptions();
  recalcScore();
}

function updateScoreboardNames(){
  const ta = teamsDB.find(t=>t.id===matchState.teamA);
  const tb = teamsDB.find(t=>t.id===matchState.teamB);
  $('#scoreTeamA').textContent = ta? ta.name : 'Đội A';
  $('#scoreTeamB').textContent = tb? tb.name : 'Đội B';
}

// build select Đội cho sự kiện
function refreshEventSelectOptions(){
  const ta = teamsDB.find(t=>t.id===matchState.teamA);
  const tb = teamsDB.find(t=>t.id===matchState.teamB);

  const goalTeamSel = $('#goalTeam');
  const cardTeamSel = $('#cardTeam');
  goalTeamSel.innerHTML = '';
  cardTeamSel.innerHTML = '';

  if(ta){
    const opt = document.createElement('option');
    opt.value = ta.id;
    opt.textContent = ta.name;
    goalTeamSel.appendChild(opt.cloneNode(true));
    cardTeamSel.appendChild(opt);
  }
  if(tb){
    const opt = document.createElement('option');
    opt.value = tb.id;
    opt.textContent = tb.name;
    goalTeamSel.appendChild(opt.cloneNode(true));
    cardTeamSel.appendChild(opt.cloneNode(true));
  }

  refreshPlayerDropdowns();
}

// build select Cầu thủ theo đội chọn
function refreshPlayerDropdowns(){
  const goalTeamSel = $('#goalTeam').value;
  const cardTeamSel = $('#cardTeam').value;
  buildPlayerOptions('#goalPlayer', goalTeamSel);
  buildPlayerOptions('#cardPlayer', cardTeamSel);
}
function buildPlayerOptions(selQuery, teamId){
  const sel = $(selQuery);
  sel.innerHTML = '';
  const t = teamsDB.find(x=>x.id===teamId);
  if(!t) return;
  t.players.forEach(p=>{
    const opt = document.createElement('option');
    const no = p.number ? `#${p.number} - ` : '';
    opt.value = JSON.stringify({name:p.name,number:p.number||'',teamId:t.id});
    opt.textContent = no + p.name;
    sel.appendChild(opt);
  });
}

// ================== Bàn thắng ==================
function handleAddGoal(){
  const minute = $('#goalMinute').value.trim();
  const teamId = $('#goalTeam').value;
  const playerDataRaw = $('#goalPlayer').value;
  const note = $('#goalNote').value.trim();

  if(!minute || !teamId || !playerDataRaw){
    toast('Thiếu thông tin bàn thắng');
    return;
  }
  const playerData = JSON.parse(playerDataRaw);
  matchState.goals.push({
    minute,
    teamId,
    playerName: playerData.name,
    playerNumber: playerData.number,
    note
  });

  $('#goalMinute').value = '';
  $('#goalNote').value = '';

  renderGoalsTable();
  recalcScore();
}

function renderGoalsTable(){
  const tbody = $('#goalsTbody');
  tbody.innerHTML = '';
  matchState.goals.forEach((g,idx)=>{
    const teamName = (teamsDB.find(t=>t.id===g.teamId)||{}).name || '??';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${g.minute}'</td>
      <td>${teamName}</td>
      <td>${g.playerNumber?('#'+g.playerNumber+' - '):''}${g.playerName}</td>
      <td>${g.note||''}</td>
      <td><button class="remove-btn" data-del-goal="${idx}">X</button></td>
    `;
    tbody.appendChild(row);
  });

  $$('[data-del-goal]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.getAttribute('data-del-goal'),10);
      matchState.goals.splice(i,1);
      renderGoalsTable();
      recalcScore();
    });
  });
}

// ================== Thẻ ==================
function handleAddCard(){
  const minute = $('#cardMinute').value.trim();
  const teamId = $('#cardTeam').value;
  const playerDataRaw = $('#cardPlayer').value;
  const type = $('#cardType').value;

  if(!minute || !teamId || !playerDataRaw || !type){
    toast('Thiếu thông tin thẻ phạt');
    return;
  }
  const playerData = JSON.parse(playerDataRaw);
  matchState.cards.push({
    minute,
    teamId,
    playerName: playerData.name,
    playerNumber: playerData.number,
    type
  });

  $('#cardMinute').value = '';

  renderCardsTable();
}
function renderCardsTable(){
  const tbody = $('#cardsTbody');
  tbody.innerHTML = '';
  matchState.cards.forEach((c,idx)=>{
    const teamName = (teamsDB.find(t=>t.id===c.teamId)||{}).name || '??';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${c.minute}'</td>
      <td>${teamName}</td>
      <td>${c.playerNumber?('#'+c.playerNumber+' - '):''}${c.playerName}</td>
      <td>${c.type}</td>
      <td><button class="remove-btn" data-del-card="${idx}">X</button></td>
    `;
    tbody.appendChild(row);
  });

  $$('[data-del-card]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.getAttribute('data-del-card'),10);
      matchState.cards.splice(i,1);
      renderCardsTable();
    });
  });
}

// ================== Scoreboard ==================
function recalcScore(){
  let aGoals = 0;
  let bGoals = 0;
  matchState.goals.forEach(g=>{
    if(g.teamId === matchState.teamA) aGoals++;
    else if(g.teamId === matchState.teamB) bGoals++;
  });

  $('#scoreGoalsA').textContent = aGoals;
  $('#scoreGoalsB').textContent = bGoals;

  const ta = teamsDB.find(t=>t.id===matchState.teamA);
  const tb = teamsDB.find(t=>t.id===matchState.teamB);
  $('#scoreTeamA').textContent = ta? ta.name : 'Đội A';
  $('#scoreTeamB').textContent = tb? tb.name : 'Đội B';
}

// ================== Signature Pad (Canvas) ==================
function initSignaturePad(canvasId, clearBtnId){
  const canvas = $(canvasId);
  const clearBtn = $(clearBtnId);

  // Prepare high-DPI canvas
  function setupCanvas(){
    const ratio = window.devicePixelRatio || 1;
    const displayWidth  = 250;
    const displayHeight = 80;
    canvas.width  = displayWidth * ratio;
    canvas.height = displayHeight * ratio;
    canvas.style.width  = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';

    // fill trắng nền
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,displayWidth,displayHeight);

    sigPads[canvasId] = {
      canvas,
      ctx,
      drawing:false,
      lastX:0,
      lastY:0,
      clearFn: ()=>{
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,displayWidth,displayHeight);
        ctx.strokeStyle = '#000';
      }
    };
  }

  setupCanvas();

  // handle pointer events
  const pad = ()=>sigPads[canvasId];

  function pointerDown(e){
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    pad().drawing = true;
    pad().lastX = e.clientX - rect.left;
    pad().lastY = e.clientY - rect.top;
  }
  function pointerMove(e){
    if(!pad().drawing) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = pad();
    p.ctx.beginPath();
    p.ctx.moveTo(p.lastX, p.lastY);
    p.ctx.lineTo(x, y);
    p.ctx.stroke();
    p.lastX = x;
    p.lastY = y;
  }
  function pointerUp(e){
    if(!pad().drawing) return;
    e.preventDefault();
    pad().drawing = false;
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointerleave', pointerUp);

  clearBtn.addEventListener('click', ()=>{
    pad().clearFn();
  });
}

// Lấy hình chữ ký dạng dataURL
function getSignatureDataURL(canvasId){
  const pad = sigPads[canvasId];
  if(!pad){ return ''; }
  return pad.canvas.toDataURL('image/png');
}

// ================== Popup Finish Flow ==================
function openFinishModal(){
  if(!matchState.teamA || !matchState.teamB){
    toast('Chọn Đội A và Đội B trước');
    return;
  }

  // lấy dữ liệu hiện tại để preview
  const ta = teamsDB.find(t=>t.id===matchState.teamA);
  const tb = teamsDB.find(t=>t.id===matchState.teamB);
  const scoreA = $('#scoreGoalsA').textContent;
  const scoreB = $('#scoreGoalsB').textContent;

  $('#previewTeams').textContent = `${ta?ta.name:'Đội A'} vs ${tb?tb.name:'Đội B'}`;
  $('#previewScore').textContent = `${scoreA} - ${scoreB}`;

  // gợi ý thời gian/địa điểm từ phần thiết lập
  $('#finalMatchTime').value = $('#matchDateTime').value || '';
  $('#finalLocation').value = $('#matchLocation').value || '';

  // gợi ý trọng tài / đội trưởng từ state nếu có
  $('#refereeNameModal').value    = matchState.referee    || '';
  $('#captainANameModal').value   = matchState.captainA   || '';
  $('#captainBNameModal').value   = matchState.captainB   || '';

  // mở popup
  $('#overlay').classList.remove('hidden');
  $('#finishModal').classList.remove('hidden');
}

function closeFinishModal(){
  $('#overlay').classList.add('hidden');
  $('#finishModal').classList.add('hidden');
}

// user bấm "Hoàn thành trận"
function confirmFinishMatch(){
  // lấy dữ liệu text từ popup
  matchState.datetime = $('#finalMatchTime').value || $('#matchDateTime').value || null;
  matchState.location = $('#finalLocation').value.trim() || $('#matchLocation').value.trim() || '';
  matchState.referee  = $('#refereeNameModal').value.trim();
  matchState.captainA = $('#captainANameModal').value.trim();
  matchState.captainB = $('#captainBNameModal').value.trim();

  // lấy chữ ký base64 từ canvas
  matchState.signatures.A = getSignatureDataURL('#sigCaptainA');
  matchState.signatures.B = getSignatureDataURL('#sigCaptainB');
  matchState.signatures.R = getSignatureDataURL('#sigReferee');

  // fill ra summaryCard
  finalizeMatchSummaryUI();

  // đóng popup
  closeFinishModal();

  toast('Đã hoàn thành trận và tạo tổng kết');
}

// dựng tổng kết cuối cùng (section 5)
function finalizeMatchSummaryUI(){
  const ta = teamsDB.find(t=>t.id===matchState.teamA);
  const tb = teamsDB.find(t=>t.id===matchState.teamB);
  const teamAName = ta? ta.name : 'Đội A';
  const teamBName = tb? tb.name : 'Đội B';

  const scoreA = $('#scoreGoalsA').textContent;
  const scoreB = $('#scoreGoalsB').textContent;

  $('#sumTeamA').textContent = teamAName;
  $('#sumTeamB').textContent = teamBName;
  $('#sumScore').textContent = scoreA + ' - ' + scoreB;

  $('#sumTime').textContent = matchState.datetime
    ? new Date(matchState.datetime).toLocaleString('vi-VN')
    : '(chưa nhập)';
  $('#sumLocation').textContent = matchState.location || '(chưa nhập)';
  $('#sumReferee').textContent = matchState.referee || '(chưa nhập)';
  $('#sumCaptainA').textContent = matchState.captainA || '(chưa nhập)';
  $('#sumCaptainB').textContent = matchState.captainB || '(chưa nhập)';

  // fill bàn thắng
  const sGoalsBody = $('#summaryGoalsTable tbody');
  sGoalsBody.innerHTML = '';
  if(matchState.goals.length === 0){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="color:#9db5aa;font-size:13px;">(Không có bàn thắng)</td>`;
    sGoalsBody.appendChild(tr);
  } else {
    matchState.goals.forEach((g,i)=>{
      const teamName = (teamsDB.find(t=>t.id===g.teamId)||{}).name || '??';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${g.minute}'</td>
        <td>${teamName}</td>
        <td>${g.playerNumber?('#'+g.playerNumber+' - '):''}${g.playerName}</td>
        <td>${g.note||''}</td>
      `;
      sGoalsBody.appendChild(tr);
    });
  }

  // fill thẻ
  const sCardsBody = $('#summaryCardsTable tbody');
  sCardsBody.innerHTML = '';
  if(matchState.cards.length === 0){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="color:#9db5aa;font-size:13px;">(Không có thẻ phạt)</td>`;
    sCardsBody.appendChild(tr);
  } else {
    matchState.cards.forEach((c,i)=>{
      const teamName = (teamsDB.find(t=>t.id===c.teamId)||{}).name || '??';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td>${c.minute}'</td>
        <td>${teamName}</td>
        <td>${c.playerNumber?('#'+c.playerNumber+' - '):''}${c.playerName}</td>
        <td>${c.type}</td>
      `;
      sCardsBody.appendChild(tr);
    });
  }

  // chữ ký preview
  $('#sumSigA').src = matchState.signatures.A || '';
  $('#sumSigB').src = matchState.signatures.B || '';
  $('#sumSigR').src = matchState.signatures.R || '';

  // show summary
  $('#summaryCard').style.display = 'block';
}

// reset trận mới
function newMatch(){
  matchState = {
    teamA: null,
    teamB: null,
    datetime: null,
    location: '',
    goals: [],
    cards: [],
    referee: '',
    captainA: '',
    captainB: '',
    signatures: { A:'', B:'', R:'' }
  };

  $('#matchDateTime').value = '';
  $('#matchLocation').value = '';

  $('#goalsTbody').innerHTML = '';
  $('#cardsTbody').innerHTML = '';

  $('#scoreGoalsA').textContent = '0';
  $('#scoreGoalsB').textContent = '0';

  $('#teamASelect').value = '';
  $('#teamBSelect').value = '';

  // popup inputs
  $('#finalMatchTime').value = '';
  $('#finalLocation').value = '';
  $('#refereeNameModal').value = '';
  $('#captainANameModal').value = '';
  $('#captainBNameModal').value = '';

  // clear canvas chữ ký
  if(sigPads['#sigCaptainA']) sigPads['#sigCaptainA'].clearFn();
  if(sigPads['#sigCaptainB']) sigPads['#sigCaptainB'].clearFn();
  if(sigPads['#sigReferee'])  sigPads['#sigReferee'].clearFn();

  // hide summary
  $('#summaryCard').style.display = 'none';

  updateScoreboardNames();
  refreshEventSelectOptions();
  toast('Đã tạo trận mới');
}

// ================== Event bindings ==================
document.addEventListener('DOMContentLoaded', ()=>{
  // init team data
  loadTeamsFromStorage();
  renderSavedTeams();
  populateTeamDropdowns();
  clearTeamEditor();

  // Add one empty player row in editor
  addPlayerRow();

  // init signature pads
  initSignaturePad('#sigCaptainA','#clearSigA');
  initSignaturePad('#sigCaptainB','#clearSigB');
  initSignaturePad('#sigReferee' ,'#clearSigR');

  // team management
  $('#btnAddPlayerRow').addEventListener('click', ()=>addPlayerRow());
  $('#btnSaveTeam').addEventListener('click', handleSaveTeam);

  // chọn đội cho trận
  $('#teamASelect').addEventListener('change', onTeamSelectionChange);
  $('#teamBSelect').addEventListener('change', onTeamSelectionChange);

  // chọn đội để load cầu thủ cho sự kiện
  $('#goalTeam').addEventListener('change', refreshPlayerDropdowns);
  $('#cardTeam').addEventListener('change', refreshPlayerDropdowns);

  // thêm sự kiện
  $('#btnAddGoal').addEventListener('click', handleAddGoal);
  $('#btnAddCard').addEventListener('click', handleAddCard);

  // popup flow
  $('#btnOpenFinish').addEventListener('click', openFinishModal);
  $('#closeFinishModal').addEventListener('click', closeFinishModal);
  $('#overlay').addEventListener('click', closeFinishModal);
  $('#btnConfirmFinish').addEventListener('click', confirmFinishMatch);

  // trận mới
  $('#btnNewMatch').addEventListener('click', newMatch);
});