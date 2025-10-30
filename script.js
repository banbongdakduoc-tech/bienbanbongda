// =============== Helpers ===============
function $(sel, root=document){ return root.querySelector(sel); }
function createEl(tag, cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }

function toast(msg){
  const t=$("#toast");
  t.textContent=msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2000);
}

// =============== Global State ===============
let allTeams = [];      // [{name:"FC A1", players:[{soAo,ten}, ...]}]
let matchData = {
  teamA: null,
  teamB: null,
  lineupA: [], // [{soAo,ten,played:true}]
  lineupB: [],
  goals: [],   // [{minute,playerName,playerNumber,teamName}]
  cards: [],   // [{minute,cardType,playerName,playerNumber,teamName}]
  meta: {
    date:"",
    time:"",
    referee:"",
  },
  signatures:{
    A:"",
    B:"",
    R:""
  }
};

// canvas signature controllers
const sigPads = {
  A: {canvas:null, ctx:null, drawing:false},
  B: {canvas:null, ctx:null, drawing:false},
  R: {canvas:null, ctx:null, drawing:false},
};

// refs to DOM
let teamASelect, teamBSelect;
let teamARosterTbody, teamBRosterTbody;
let teamANameLbl, teamBNameLbl;
let goalTeamSelect, goalPlayerSelect, goalMinuteInput, btnAddGoal, goalsListTbody;
let cardTeamSelect, cardPlayerSelect, cardMinuteInput, cardTypeSelect, btnAddCard, cardsListTbody;
let btnOpenSign, signModal, btnCloseModal, btnFinishMatch;
let matchDateInput, matchTimeInput, refNameInput;
let sigCanvasA, sigCanvasB, sigCanvasRef;
let btnDownloadJSON, statusMsg;

// final summary DOM
let finalSummarySection;
let finalTimeText, finalRefText, finalMatchText, finalScoreText;
let finalTeamATitle, finalTeamBTitle, finalTeamAList, finalTeamBList;
let finalGoalsTbody, finalCardsTbody, sigAImg, sigBImg, sigRefImg;
let signTeamALabel, signTeamBLabel, sigALabel, sigBLabel;

// =============== Load teams.json ===============
async function loadTeams(){
  try{
    const r = await fetch("teams.json",{cache:"no-cache"});
    if(!r.ok){
      console.warn("Không đọc được teams.json");
      toast("Không đọc được teams.json");
      return;
    }
    const data = await r.json();
    allTeams = extractTeams(data);
    fillTeamDropdowns();
  }catch(err){
    console.error("Lỗi load teams.json:", err);
    toast("Lỗi load teams.json");
  }
}

// Extract teams from structure {cheDo:"bang",bangs:[...]} or {cheDo:"vong",doi:[...]}
function extractTeams(json){
  const arr=[];
  if(!json) return arr;

  const mode=(json.cheDo||"").toLowerCase();
  if(mode==="bang"){
    if(Array.isArray(json.bangs)){
      json.bangs.forEach(bg=>{
        if(Array.isArray(bg.doi)){
          bg.doi.forEach(d=>{
            const nm=d.tenDoi||"";
            if(!nm) return;
            const players = Array.isArray(d.cauThu)? d.cauThu: [];
            arr.push({
              name:nm,
              players:players.map(p=>({
                soAo:p.soAo ?? "",
                ten:p.ten ?? ""
              }))
            });
          });
        }
      });
    }
  }else{
    // vong: json.doi
    if(Array.isArray(json.doi)){
      json.doi.forEach(d=>{
        const nm=d.tenDoi||"";
        if(!nm) return;
        const players = Array.isArray(d.cauThu)? d.cauThu: [];
        arr.push({
          name:nm,
          players:players.map(p=>({
            soAo:p.soAo ?? "",
            ten:p.ten ?? ""
          }))
        });
      });
    }
  }
  return arr;
}

// populate Đội A / Đội B selects
function fillTeamDropdowns(){
  clearChildren(teamASelect);
  clearChildren(teamBSelect);
  const optA = new Option("-- Chọn đội A --","");
  const optB = new Option("-- Chọn đội B --","");
  teamASelect.appendChild(optA);
  teamBSelect.appendChild(optB);

  allTeams.forEach(t=>{
    teamASelect.appendChild(new Option(t.name, t.name));
    teamBSelect.appendChild(new Option(t.name, t.name));
  });

  fillGoalCardTeamSelects(); // also init the team list for events section
}

function clearChildren(node){
  while(node.firstChild) node.removeChild(node.firstChild);
}

// Render roster table for selected team
// ========== PATCH for duplicate roster when switching teams ==========
function renderRoster(which){
  const tname = which==="A" ? teamASelect.value : teamBSelect.value;
  const tbody = which==="A" ? teamARosterTbody : teamBRosterTbody;
  const lbl   = which==="A" ? teamANameLbl     : teamBNameLbl;

  // Khi chưa chọn đội -> reset đúng nhánh & UI
  if(!tname){
    lbl.textContent = (which==="A" ? "Đội A" : "Đội B");
    tbody.innerHTML = `<tr><td colspan="3" class="dim">(chưa chọn đội)</td></tr>`;
    if(which==="A"){ matchData.teamA = null; matchData.lineupA = []; }
    else           { matchData.teamB = null; matchData.lineupB = []; }
    updateSignLabels();
    fillGoalCardTeamSelects(); // giữ đồng bộ dropdown sự kiện
    return;
  }

  // Lấy team cũ để biết có đổi đội hay không
  const prevName = (which==="A" ? matchData.teamA : matchData.teamB);

  // Cập nhật tên đội vào matchData trước
  if(which==="A"){ matchData.teamA = tname; }
  else           { matchData.teamB = tname; }

  lbl.textContent = tname;

  // Tìm object đội
  const teamObj = allTeams.find(t => t.name === tname);
  if(!teamObj){
    tbody.innerHTML = `<tr><td colspan="3" class="dim">(không tìm thấy cầu thủ)</td></tr>`;
    return;
  }

  // Xác định mảng lineup mục tiêu
  const targetLineup = (which==="A" ? matchData.lineupA : matchData.lineupB);

  // ⚠️ QUAN TRỌNG: nếu người dùng đổi sang đội khác -> reset lineup, tránh cộng dồn
  if(prevName && prevName !== tname){
    targetLineup.length = 0;
  }

  // Đồng bộ lineup theo danh sách cầu thủ của team hiện tại
  // (đảm bảo mỗi cầu thủ có đúng 1 bản ghi)
  const key = p => `${p.soAo}@@${p.ten}`;
  const wanted = new Map(teamObj.players.map(p => [key(p), {soAo:p.soAo, ten:p.ten}]));
  const existing = new Set(targetLineup.map(p => key(p)));

  // Thêm những cầu thủ còn thiếu
  for(const [k, pl] of wanted.entries()){
    if(!existing.has(k)){
      targetLineup.push({ soAo: pl.soAo, ten: pl.ten, played: false });
    }
  }
  // Loại bỏ những cầu thủ không thuộc đội mới (trường hợp đổi đội)
  for(let i = targetLineup.length - 1; i >= 0; i--){
    const k = key(targetLineup[i]);
    if(!wanted.has(k)){
      targetLineup.splice(i, 1);
    }
  }

  // Render bảng đội hình
  tbody.innerHTML = "";
  targetLineup.forEach(p => {
    const tr = document.createElement("tr");

    const tdChk = document.createElement("td");
    tdChk.style.textAlign = "center";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = p.played === true;
    chk.addEventListener("change", () => { p.played = chk.checked; });
    tdChk.appendChild(chk);

    const tdNum = document.createElement("td");
    tdNum.textContent = p.soAo;

    const tdName = document.createElement("td");
    tdName.textContent = p.ten;

    tr.appendChild(tdChk);
    tr.appendChild(tdNum);
    tr.appendChild(tdName);
    tbody.appendChild(tr);
  });

  // Cập nhật label chữ ký & dropdown sự kiện (đội/cầu thủ) để không bị lặp
  updateSignLabels();
  fillGoalCardTeamSelects();
}

// keep labels in sign modal / final summary in sync
function updateSignLabels(){
  const aName = matchData.teamA || "Đội A";
  const bName = matchData.teamB || "Đội B";

  if(signTeamALabel) signTeamALabel.textContent = `Đội trưởng ${aName} ký`;
  if(signTeamBLabel) signTeamBLabel.textContent = `Đội trưởng ${bName} ký`;

  if(sigALabel) sigALabel.textContent = `Đội trưởng ${aName}`;
  if(sigBLabel) sigBLabel.textContent = `Đội trưởng ${bName}`;

  if(finalTeamATitle) finalTeamATitle.textContent = aName;
  if(finalTeamBTitle) finalTeamBTitle.textContent = bName;
}

// fill "Đội" dropdown trong phần sự kiện (bàn thắng / thẻ)
function fillGoalCardTeamSelects(){
  // Goal form
  clearChildren(goalTeamSelect);
  goalTeamSelect.appendChild(new Option("-- Chọn đội --",""));
  if(matchData.teamA) goalTeamSelect.appendChild(new Option(matchData.teamA,"A"));
  if(matchData.teamB) goalTeamSelect.appendChild(new Option(matchData.teamB,"B"));

  // Card form
  clearChildren(cardTeamSelect);
  cardTeamSelect.appendChild(new Option("-- Chọn đội --",""));
  if(matchData.teamA) cardTeamSelect.appendChild(new Option(matchData.teamA,"A"));
  if(matchData.teamB) cardTeamSelect.appendChild(new Option(matchData.teamB,"B"));

  refreshPlayerDropdown("goal");
  refreshPlayerDropdown("card");
}

// when chọn đội trong form sự kiện -> load cầu thủ của đội đó
function refreshPlayerDropdown(which){
  // which = "goal" or "card"
  const teamSel = which==="goal"? goalTeamSelect: cardTeamSelect;
  const playerSel = which==="goal"? goalPlayerSelect: cardPlayerSelect;

  clearChildren(playerSel);
  playerSel.appendChild(new Option("-- Chọn cầu thủ --",""));

  const val=teamSel.value;
  let arrPlayers=[];
  if(val==="A"){
    arrPlayers = matchData.lineupA.map(p=>p); // all lineup, tick hay không tick vẫn cho chọn
  }else if(val==="B"){
    arrPlayers = matchData.lineupB.map(p=>p);
  }

  arrPlayers.forEach(p=>{
    const label=`${p.soAo} - ${p.ten}`;
    playerSel.appendChild(new Option(label, p.soAo+"@@"+p.ten));
  });
}

// track change đội ở form sự kiện
function attachTeamSelectEvents(){
  goalTeamSelect.addEventListener("change",()=>{
    refreshPlayerDropdown("goal");
  });
  cardTeamSelect.addEventListener("change",()=>{
    refreshPlayerDropdown("card");
  });
}

// add goal
function addGoal(){
  const tval = goalTeamSelect.value; // "A" or "B"
  const pval = goalPlayerSelect.value; // "num@@name"
  const minute = goalMinuteInput.value.trim();

  if(!tval || !pval || !minute){
    toast("Thiếu thông tin bàn thắng");
    return;
  }

  const [num, name] = pval.split("@@");
  const teamName = (tval==="A"? matchData.teamA : matchData.teamB) || "";

  matchData.goals.push({
    minute,
    playerName:name,
    playerNumber:num,
    teamName
  });

  goalMinuteInput.value="";
  renderGoalsTable();
  toast("Đã thêm bàn thắng");
}

// render goals list
function renderGoalsTable(){
  goalsListTbody.innerHTML="";
  if(!matchData.goals.length){
    goalsListTbody.innerHTML=`<tr><td colspan="4" class="dim">(chưa có)</td></tr>`;
    return;
  }
  matchData.goals.forEach((g,idx)=>{
    const tr=createEl("tr");
    tr.innerHTML=`
      <td>${idx+1}</td>
      <td>${g.minute}'</td>
      <td>${g.playerNumber} - ${g.playerName}</td>
      <td>${g.teamName}</td>
    `;
    goalsListTbody.appendChild(tr);
  });
}

// add card
function addCard(){
  const tval = cardTeamSelect.value;
  const pval = cardPlayerSelect.value;
  const minute = cardMinuteInput.value.trim();
  const ctype = cardTypeSelect.value;

  if(!tval || !pval || !minute || !ctype){
    toast("Thiếu thông tin thẻ phạt");
    return;
  }

  const [num,name]=pval.split("@@");
  const teamName=(tval==="A"? matchData.teamA : matchData.teamB) || "";

  matchData.cards.push({
    minute,
    cardType:ctype,
    playerName:name,
    playerNumber:num,
    teamName
  });

  cardMinuteInput.value="";
  renderCardsTable();
  toast("Đã thêm thẻ");
}

// render cards list
function renderCardsTable(){
  cardsListTbody.innerHTML="";
  if(!matchData.cards.length){
    cardsListTbody.innerHTML=`<tr><td colspan="5" class="dim">(chưa có)</td></tr>`;
    return;
  }
  matchData.cards.forEach((c,idx)=>{
    const tr=createEl("tr");
    tr.innerHTML=`
      <td>${idx+1}</td>
      <td>${c.minute}'</td>
      <td>${c.cardType}</td>
      <td>${c.playerNumber} - ${c.playerName}</td>
      <td>${c.teamName}</td>
    `;
    cardsListTbody.appendChild(tr);
  });
}

// =============== Signature pad logic ===============
function setupSignaturePad(key, canvas){
  const pad = sigPads[key];
  pad.canvas = canvas;
  pad.ctx = canvas.getContext("2d");
  pad.ctx.lineWidth=2;
  pad.ctx.lineJoin="round";
  pad.ctx.lineCap="round";
  pad.ctx.strokeStyle="#fff";

  function pos(e){
    const rect=canvas.getBoundingClientRect();
    if(e.touches && e.touches.length){
      return {
        x:e.touches[0].clientX - rect.left,
        y:e.touches[0].clientY - rect.top
      };
    }else{
      return {
        x:e.clientX - rect.left,
        y:e.clientY - rect.top
      };
    }
  }

  function start(e){
    e.preventDefault();
    const p=pos(e);
    pad.drawing=true;
    pad.ctx.beginPath();
    pad.ctx.moveTo(p.x,p.y);
  }

  function move(e){
    if(!pad.drawing) return;
    e.preventDefault();
    const p=pos(e);
    pad.ctx.lineTo(p.x,p.y);
    pad.ctx.stroke();
  }

  function end(e){
    if(!pad.drawing) return;
    e.preventDefault();
    pad.drawing=false;
  }

  canvas.addEventListener("mousedown",start);
  canvas.addEventListener("mousemove",move);
  canvas.addEventListener("mouseup",end);
  canvas.addEventListener("mouseleave",end);

  canvas.addEventListener("touchstart",start,{passive:false});
  canvas.addEventListener("touchmove",move,{passive:false});
  canvas.addEventListener("touchend",end,{passive:false});
}

// clear signature
function clearSignature(key){
  const pad=sigPads[key];
  if(!pad.canvas || !pad.ctx) return;
  pad.ctx.clearRect(0,0,pad.canvas.width,pad.canvas.height);
}

// read signature as dataURL
function readSignature(key){
  const pad=sigPads[key];
  if(!pad.canvas) return "";
  return pad.canvas.toDataURL("image/png");
}

// =============== Modal logic ===============
function openSignModal(){
  if(!matchData.teamA || !matchData.teamB){
    toast("Chọn đội A & B trước");
    return;
  }
  signModal.classList.remove("hidden");

  // set default time fields if empty
  const now = new Date();
  if(!matchDateInput.value){
    matchDateInput.value = now.toISOString().slice(0,10); // YYYY-MM-DD
  }
  if(!matchTimeInput.value){
    const hh = String(now.getHours()).padStart(2,"0");
    const mm = String(now.getMinutes()).padStart(2,"0");
    matchTimeInput.value = `${hh}:${mm}`;
  }
}

function closeSignModal(){
  signModal.classList.add("hidden");
}

// =============== Finalize match ===============
function finalizeMatch(){
  // gather meta
  matchData.meta.date = matchDateInput.value.trim();
  matchData.meta.time = matchTimeInput.value.trim();
  matchData.meta.referee = refNameInput.value.trim();

  // signatures
  matchData.signatures.A = readSignature("A");
  matchData.signatures.B = readSignature("B");
  matchData.signatures.R = readSignature("R");

  // compute score
  const scoreA = matchData.goals.filter(g=>g.teamName===matchData.teamA).length;
  const scoreB = matchData.goals.filter(g=>g.teamName===matchData.teamB).length;

  // build final lineup only who played=true
  const playedA = matchData.lineupA.filter(p=>p.played).map(p=>({soAo:p.soAo,ten:p.ten}));
  const playedB = matchData.lineupB.filter(p=>p.played).map(p=>({soAo:p.soAo,ten:p.ten}));

  // render final section
  finalTimeText.textContent = `${matchData.meta.date || ""} ${matchData.meta.time || ""}`.trim();
  finalRefText.textContent = matchData.meta.referee || "(chưa nhập)";
  finalMatchText.textContent = `${matchData.teamA || "Đội A"} vs ${matchData.teamB || "Đội B"}`;
  finalScoreText.textContent = `${scoreA} - ${scoreB}`;

  // team titles
  finalTeamATitle.textContent = matchData.teamA || "Đội A";
  finalTeamBTitle.textContent = matchData.teamB || "Đội B";

  // rosters
  finalTeamAList.innerHTML="";
  finalTeamBList.innerHTML="";
  if(playedA.length){
    playedA.forEach(p=>{
      const li=createEl("li");
      li.textContent=`${p.soAo} - ${p.ten}`;
      finalTeamAList.appendChild(li);
    });
  } else {
    const li=createEl("li","dim");
    li.textContent="(không đánh dấu ai ra sân)";
    finalTeamAList.appendChild(li);
  }
  if(playedB.length){
    playedB.forEach(p=>{
      const li=createEl("li");
      li.textContent=`${p.soAo} - ${p.ten}`;
      finalTeamBList.appendChild(li);
    });
  } else {
    const li=createEl("li","dim");
    li.textContent="(không đánh dấu ai ra sân)";
    finalTeamBList.appendChild(li);
  }

  // goals
  finalGoalsTbody.innerHTML="";
  if(matchData.goals.length){
    matchData.goals.forEach((g,idx)=>{
      const tr=createEl("tr");
      tr.innerHTML=`
        <td>${idx+1}</td>
        <td>${g.minute}'</td>
        <td>${g.playerNumber} - ${g.playerName}</td>
        <td>${g.teamName}</td>
      `;
      finalGoalsTbody.appendChild(tr);
    });
  } else {
    finalGoalsTbody.innerHTML=`<tr><td colspan="4" class="dim">(không có)</td></tr>`;
  }

  // cards
  finalCardsTbody.innerHTML="";
  if(matchData.cards.length){
    matchData.cards.forEach((c,idx)=>{
      const tr=createEl("tr");
      tr.innerHTML=`
        <td>${idx+1}</td>
        <td>${c.minute}'</td>
        <td>${c.cardType}</td>
        <td>${c.playerNumber} - ${c.playerName}</td>
        <td>${c.teamName}</td>
      `;
      finalCardsTbody.appendChild(tr);
    });
  } else {
    finalCardsTbody.innerHTML=`<tr><td colspan="5" class="dim">(không có)</td></tr>`;
  }

  // signatures preview
  sigAImg.src = matchData.signatures.A || "";
  sigBImg.src = matchData.signatures.B || "";
  sigRefImg.src = matchData.signatures.R || "";

  sigALabel.textContent = `Đội trưởng ${matchData.teamA || "A"}`;
  sigBLabel.textContent = `Đội trưởng ${matchData.teamB || "B"}`;

  // show final summary section
  finalSummarySection.classList.remove("hidden");

  // enable download button
  btnDownloadJSON.disabled=false;

  // update status
  statusMsg.textContent="ĐÃ HOÀN TẤT";
  toast("Đã hoàn tất trận và tạo biên bản cuối cùng");
  closeSignModal();
}

// download JSON file
function downloadJSON(){
  // compute final score again for safety
  const scoreA = matchData.goals.filter(g=>g.teamName===matchData.teamA).length;
  const scoreB = matchData.goals.filter(g=>g.teamName===matchData.teamB).length;

  // lineup only 'played'
  const playedA = matchData.lineupA.filter(p=>p.played).map(p=>({soAo:p.soAo,ten:p.ten}));
  const playedB = matchData.lineupB.filter(p=>p.played).map(p=>({soAo:p.soAo,ten:p.ten}));

  // final object same format BXH expects
  const out = {
    meta:{
      date: matchData.meta.date,
      time: matchData.meta.time,
      referee: matchData.meta.referee,
    },
    teams:{
      A:{
        name: matchData.teamA,
        score: scoreA,
        lineup: playedA
      },
      B:{
        name: matchData.teamB,
        score: scoreB,
        lineup: playedB
      }
    },
    goals: matchData.goals.slice(), // copy array
    cards: matchData.cards.slice(),
    signatures:{
      captainA: matchData.signatures.A,
      captainB: matchData.signatures.B,
      referee: matchData.signatures.R
    }
  };

  const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
  // filename
  const d = matchData.meta.date || "xxxx-xx-xx";
  const t = matchData.meta.time? matchData.meta.time.replace(":","-") : "hh-mm";
  const safeA = (matchData.teamA||"A").replace(/\s+/g,"_");
  const safeB = (matchData.teamB||"B").replace(/\s+/g,"_");
  const fname=`summary_${d}_${t}_${safeA}_vs_${safeB}.json`;

  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=fname;
  a.click();
  URL.revokeObjectURL(a.href);

  toast("Đã tải JSON trận");
}

// =============== INIT / BIND ===============
function bindUI(){
  teamASelect = $("#teamASelect");
  teamBSelect = $("#teamBSelect");
  teamARosterTbody = $("#teamARosterTbody");
  teamBRosterTbody = $("#teamBRosterTbody");
  teamANameLbl = $("#teamANameLbl");
  teamBNameLbl = $("#teamBNameLbl");

  goalTeamSelect = $("#goalTeamSelect");
  goalPlayerSelect = $("#goalPlayerSelect");
  goalMinuteInput = $("#goalMinuteInput");
  btnAddGoal = $("#btnAddGoal");
  goalsListTbody = $("#goalsListTbody");

  cardTeamSelect = $("#cardTeamSelect");
  cardPlayerSelect = $("#cardPlayerSelect");
  cardMinuteInput = $("#cardMinuteInput");
  cardTypeSelect = $("#cardTypeSelect");
  btnAddCard = $("#btnAddCard");
  cardsListTbody = $("#cardsListTbody");

  btnOpenSign = $("#btnOpenSign");
  signModal = $("#signModal");
  btnCloseModal = $("#btnCloseModal");
  btnFinishMatch = $("#btnFinishMatch");

  matchDateInput = $("#matchDateInput");
  matchTimeInput = $("#matchTimeInput");
  refNameInput = $("#refNameInput");

  sigCanvasA = $("#sigCanvasA");
  sigCanvasB = $("#sigCanvasB");
  sigCanvasRef = $("#sigCanvasRef");

  btnDownloadJSON = $("#btnDownloadJSON");
  statusMsg = $("#statusMsg");

  finalSummarySection = $("#finalSummarySection");
  finalTimeText = $("#finalTimeText");
  finalRefText = $("#finalRefText");
  finalMatchText = $("#finalMatchText");
  finalScoreText = $("#finalScoreText");

  finalTeamATitle = $("#finalTeamATitle");
  finalTeamBTitle = $("#finalTeamBTitle");
  finalTeamAList = $("#finalTeamAList");
  finalTeamBList = $("#finalTeamBList");

  finalGoalsTbody = $("#finalGoalsTbody");
  finalCardsTbody = $("#finalCardsTbody");

  sigAImg = $("#sigAImg");
  sigBImg = $("#sigBImg");
  sigRefImg = $("#sigRefImg");

  signTeamALabel = $("#signTeamALabel");
  signTeamBLabel = $("#signTeamBLabel");
  sigALabel = $("#sigALabel");
  sigBLabel = $("#sigBLabel");

  // events
  teamASelect.addEventListener("change",()=>renderRoster("A"));
  teamBSelect.addEventListener("change",()=>renderRoster("B"));

  btnAddGoal.addEventListener("click",addGoal);
  btnAddCard.addEventListener("click",addCard);

  attachTeamSelectEvents();

  btnOpenSign.addEventListener("click",openSignModal);
  btnCloseModal.addEventListener("click",closeSignModal);
  $("#signModal .modal-bg").addEventListener("click",closeSignModal);

  // Clear signature buttons
  document.querySelectorAll("[data-clear]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const k=btn.getAttribute("data-clear");
      clearSignature(k);
    });
  });

  btnFinishMatch.addEventListener("click",finalizeMatch);
  btnDownloadJSON.addEventListener("click",downloadJSON);

  // setup signature pads
  setupSignaturePad("A", sigCanvasA);
  setupSignaturePad("B", sigCanvasB);
  setupSignaturePad("R", sigCanvasRef);

  updateSignLabels();
  renderGoalsTable();
  renderCardsTable();
}

document.addEventListener("DOMContentLoaded",()=>{
  bindUI();
  loadTeams(); // load teams.json -> dropdown đội
});
