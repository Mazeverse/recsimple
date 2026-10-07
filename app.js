const $=id=>document.getElementById(id);
const startBtn=$("startBtn"),pauseBtn=$("pauseBtn"),stopBtn=$("stopBtn");
const systemAudio=$("systemAudio"),micAudio=$("micAudio"),timer=$("timer"),statusEl=$("status");
const segmentsBox=$("segmentsBox"),segmentsEl=$("segments"),fullBox=$("fullBox");
const fullPreview=$("fullPreview"),fullDownload=$("fullDownload");
const SPLIT_MS=180000;
let displayStream,micStream,audioContext,audioStream;
let fullRecorder,segmentRecorder,fullChunks=[],segmentChunks=[],segmentNo=1;
let startedAt=0,timerId,splitTimeout,ending=false,paused=false,pauseAt=0,totalPaused=0;

function mime(){return ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(x=>MediaRecorder.isTypeSupported(x))||""}
function opts(){const m=mime();return m?{mimeType:m}:{}}
function fmt(ms){let s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,"0")).join(":")}
function stamp(){return new Date().toISOString().replace(/[:.]/g,"-")}
function elapsed(){return Date.now()-startedAt-totalPaused-(paused?Date.now()-pauseAt:0)}
function cleanup(){clearInterval(timerId);clearTimeout(splitTimeout);[displayStream,micStream,audioStream].forEach(s=>s?.getTracks().forEach(t=>t.stop()));audioContext?.close().catch(()=>{})}
function addSegment(blob,n){
  if(!blob.size)return;
  segmentsBox.classList.remove("hidden");
  const row=document.createElement("div");row.className="segment";
  const label=document.createElement("div");label.innerHTML=`<strong>구간 ${String(n).padStart(2,"0")}</strong><br><small>독립 재생 가능한 파일</small>`;
  const a=document.createElement("a");a.className="download";a.href=URL.createObjectURL(blob);a.download=`recsimple-part-${String(n).padStart(2,"0")}-${stamp()}.webm`;a.textContent="구간 저장";
  row.append(label,a);segmentsEl.appendChild(row);
}
function startSegment(){
  if(ending)return;
  segmentChunks=[];
  segmentRecorder=new MediaRecorder(audioStream,opts());
  segmentRecorder.ondataavailable=e=>{if(e.data.size)segmentChunks.push(e.data)};
  segmentRecorder.onstop=()=>{
    const blob=new Blob(segmentChunks,{type:segmentRecorder.mimeType||"audio/webm"});
    if(blob.size)addSegment(blob,segmentNo++);
    if(!ending && fullRecorder?.state!=="inactive"){
      startSegment();
      splitTimeout=setTimeout(()=>{if(segmentRecorder?.state==="recording")segmentRecorder.stop()},SPLIT_MS);
    }
  };
  segmentRecorder.start();
}
startBtn.onclick=async()=>{
 try{
  if(!systemAudio.checked&&!micAudio.checked)return alert("녹음할 소리를 선택하세요.");
  ending=false;paused=false;fullChunks=[];segmentNo=1;segmentsEl.innerHTML="";segmentsBox.classList.add("hidden");fullBox.classList.add("hidden");
  if(systemAudio.checked){
    displayStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
    if(!displayStream.getAudioTracks().length){displayStream.getTracks().forEach(t=>t.stop());return alert('오디오 공유가 꺼져 있습니다. "탭 오디오와 함께 공유"를 켜주세요.')}
  }
  if(micAudio.checked)micStream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(systemAudio.checked&&micAudio.checked){
    audioContext=new AudioContext();const d=audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(displayStream).connect(d);audioContext.createMediaStreamSource(micStream).connect(d);audioStream=d.stream;
  } else audioStream=new MediaStream((systemAudio.checked?displayStream:micStream).getAudioTracks());

  fullRecorder=new MediaRecorder(audioStream,opts());
  fullRecorder.ondataavailable=e=>{if(e.data.size)fullChunks.push(e.data)};
  fullRecorder.onstop=()=>{
    const blob=new Blob(fullChunks,{type:fullRecorder.mimeType||"audio/webm"});
    const u=URL.createObjectURL(blob);fullPreview.src=u;fullDownload.href=u;fullDownload.download=`recsimple-full-${stamp()}.webm`;
    fullBox.classList.remove("hidden");statusEl.textContent="녹음 완료 · 전체 파일 준비됨";
    startBtn.disabled=false;pauseBtn.disabled=true;stopBtn.disabled=true;pauseBtn.textContent="Ⅱ 일시정지";cleanup();
  };
  fullRecorder.start(1000);
  startedAt=Date.now();totalPaused=0;timer.textContent="00:00:00";
  timerId=setInterval(()=>timer.textContent=fmt(elapsed()),250);
  startSegment();splitTimeout=setTimeout(()=>{if(segmentRecorder?.state==="recording")segmentRecorder.stop()},SPLIT_MS);
  statusEl.textContent="녹음 중 · 3분마다 자동 분할";startBtn.disabled=true;pauseBtn.disabled=false;stopBtn.disabled=false;
  displayStream?.getVideoTracks()[0]?.addEventListener("ended",()=>stopAll());
 }catch(e){console.error(e);statusEl.textContent="취소됨 또는 권한 오류";cleanup()}
};
function stopAll(){
 if(ending)return; ending=true;clearTimeout(splitTimeout);
 if(paused){if(segmentRecorder?.state==="paused")segmentRecorder.resume();if(fullRecorder?.state==="paused")fullRecorder.resume();paused=false}
 if(segmentRecorder&&segmentRecorder.state!=="inactive")segmentRecorder.stop();
 if(fullRecorder&&fullRecorder.state!=="inactive")setTimeout(()=>fullRecorder.stop(),100);
}
stopBtn.onclick=stopAll;
pauseBtn.onclick=()=>{
 if(!fullRecorder)return;
 if(!paused){
   if(fullRecorder.state==="recording")fullRecorder.pause();
   if(segmentRecorder?.state==="recording")segmentRecorder.pause();
   paused=true;pauseAt=Date.now();clearTimeout(splitTimeout);pauseBtn.textContent="▶ 계속";statusEl.textContent="일시정지";
 }else{
   totalPaused+=Date.now()-pauseAt;paused=false;
   if(fullRecorder.state==="paused")fullRecorder.resume();
   if(segmentRecorder?.state==="paused")segmentRecorder.resume();
   clearTimeout(splitTimeout);splitTimeout=setTimeout(()=>{if(segmentRecorder?.state==="recording")segmentRecorder.stop()},SPLIT_MS);
   pauseBtn.textContent="Ⅱ 일시정지";statusEl.textContent="녹음 중 · 3분마다 자동 분할";
 }
};