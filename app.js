const DATA_URL='https://raw.githubusercontent.com/letzbug/franks_magic/ee1deb187cb56360699bb18606d7685de65d9e6c/data/trainings.json';
const SITES_URL='https://raw.githubusercontent.com/letzbug/unipop_go_sites/main/sites.json';
const LOCATIONS_URL='https://raw.githubusercontent.com/letzbug/unipop_app/main/data/locations.json';
const SITES_BASE='https://raw.githubusercontent.com/letzbug/unipop_go_sites/main/';

let trainings=[];
let sitesData={schemaVersion:3,guides:[],locations:[]};
let legacyLocations={};
let currentCourse=null;
let currentSite=null;
let currentRoom=null;
let lastResults=[];
let backStack=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DAY_NAMES=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function parseDMY(v){if(!v)return null; const m=String(v).match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/); return m?new Date(+m[3],+m[2]-1,+m[1]):null;}
function formatDate(d){return d?new Intl.DateTimeFormat('fr-LU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d):'';}
function codeOf(c){return c.coursCode||c.coursId||c.code||c.reference||String(c.id||'');}
function titleOf(c){return c.intitule||c.titre||'Cours UniPop';}
function venueOf(c){const a=c.adresseCours||{};return a.nom||a.localite||'Lieu à confirmer';}
function addressOfCourse(c){const a=c.adresseCours||{};return [a.rueNumero,[a.paysCode==='L'?'L-':'',a.codePostal||'',a.localite||''].join('')].filter(Boolean).join('\n');}
function siteAsset(path){if(!path)return''; if(/^https?:/i.test(path))return path; return SITES_BASE+String(path).replace(/^\/+/, '');}
function favorites(){try{return JSON.parse(localStorage.getItem('unipopParticipantFavorites')||'[]')}catch{return[]}}
function saveFavorites(arr){localStorage.setItem('unipopParticipantFavorites',JSON.stringify([...new Set(arr.map(String))]));}
function isFavorite(c){return favorites().includes(String(c.id));}
function toggleFavorite(c){let f=favorites();const id=String(c.id); f=f.includes(id)?f.filter(x=>x!==id):[...f,id]; saveFavorites(f); renderFavoriteButton(); renderFavorites();}

function showScreen(id,push=true){const active=$('.screen.active');if(push&&active&&active.id!==id)backStack.push(active.id);$$('.screen').forEach(x=>x.classList.remove('active'));$('#'+id)?.classList.add('active');$$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.go===id));window.scrollTo(0,0);}
$$('[data-back]').forEach(b=>b.onclick=()=>showScreen(backStack.pop()||'searchScreen',false));
$$('.bottom-nav button').forEach(b=>b.onclick=()=>{if(b.dataset.go==='resultsScreen'){renderResults(lastResults.length?lastResults:upcomingCourses().slice(0,30),'Prochains cours');}if(b.dataset.go==='favoritesScreen')renderFavorites();showScreen(b.dataset.go,false)});

function upcomingCourses(){const today=new Date(); today.setHours(0,0,0,0);return trainings.filter(c=>{const end=parseDMY(c.dateFin)||parseDMY(c.dateDebut);return !end||end>=today}).sort((a,b)=>(parseDMY(a.dateDebut)||0)-(parseDMY(b.dateDebut)||0));}
function scoreCourse(c,q){const nq=norm(q);if(!nq)return 999;const code=norm(codeOf(c)),title=norm(titleOf(c));if(code===nq)return 0;if(code.startsWith(nq))return 1;if(title.startsWith(nq))return 2;if(code.includes(nq))return 3;if(title.includes(nq))return 4;const words=nq.split(' ').filter(Boolean);return words.every(w=>title.includes(w))?5:999;}
function searchCourses(q,limit=30){return upcomingCourses().map(c=>[scoreCourse(c,q),c]).filter(x=>x[0]<999).sort((a,b)=>a[0]-b[0]||(parseDMY(a[1].dateDebut)||0)-(parseDMY(b[1].dateDebut)||0)).slice(0,limit).map(x=>x[1]);}

function renderSuggestions(q){const box=$('#suggestions');if(q.trim().length<2){box.classList.add('hidden');box.innerHTML='';return;}const hits=searchCourses(q,6);if(!hits.length){box.classList.add('hidden');return;}box.innerHTML=hits.map(c=>`<button data-id="${esc(c.id)}"><strong>${esc(titleOf(c))}</strong><small>${esc(codeOf(c))} · ${esc(venueOf(c))}</small></button>`).join('');box.classList.remove('hidden');box.querySelectorAll('button').forEach(b=>b.onclick=()=>openCourse(trainings.find(c=>String(c.id)===b.dataset.id)));
}
let searchTimer;$('#courseSearch').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderSuggestions(e.target.value),120)});
$('#clearSearch').onclick=()=>{$('#courseSearch').value='';$('#suggestions').classList.add('hidden');$('#courseSearch').focus()};
$('#searchButton').onclick=()=>doSearch();$('#courseSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch();}});
function doSearch(){const q=$('#courseSearch').value.trim();if(!q)return;const r=searchCourses(q,40);renderResults(r,`${r.length} résultat${r.length===1?'':'s'} pour « ${q} »`);showScreen('resultsScreen');$('#suggestions').classList.add('hidden');}

function renderResults(list,title='Cours trouvés'){lastResults=list;$('#resultsTitle').textContent=title;const host=$('#resultsList');host.innerHTML=list.length?list.map(courseCard).join(''):`<div class="empty">Aucun cours trouvé.</div>`;host.querySelectorAll('.course-card').forEach(el=>el.onclick=()=>openCourse(trainings.find(c=>String(c.id)===el.dataset.id)));}
function courseCard(c){return `<article class="course-card" data-id="${esc(c.id)}"><div><h3>${esc(titleOf(c))}</h3><p>${esc(codeOf(c))}</p><p>${esc(c.dateDebut||'')} → ${esc(c.dateFin||'')}</p><p>${esc(venueOf(c))}</p><span class="code-chip">${esc(c.categorieNom||c.categorieCodeUnipop||'UniPop')}</span></div><div class="chev">›</div></article>`}

function findSite(c){const a=c.adresseCours||{};const candidates=[a.nom,a.localite,`${a.rueNumero||''} ${a.codePostal||''} ${a.localite||''}`].filter(Boolean).map(norm);let best=null,bestScore=0;for(const s of sitesData.locations||[]){if(s.active===false)continue;const names=[s.name,...(s.aliases||[])].map(norm).filter(Boolean);let score=0;for(const q of candidates){for(const n of names){if(q===n)score=Math.max(score,100);else if(q.includes(n)||n.includes(q))score=Math.max(score,80);}}
 const addr=norm(s.address||'');const ca=norm(`${a.rueNumero||''} ${a.codePostal||''} ${a.localite||''}`);if(ca&&addr){const tokens=ca.split(' ').filter(x=>x.length>2);const matched=tokens.filter(t=>addr.includes(t)).length;score=Math.max(score,matched*8)}if(score>bestScore){best=s;bestScore=score;}}
return bestScore>=16?best:null;}
function legacyLocation(c){const key=norm(`${c.adresseCours?.nom||''}${c.adresseCours?.rueNumero||''}${c.adresseCours?.localite||''}`);const byCourse=legacyLocations.courses?.[norm(codeOf(c))];return byCourse?{...(legacyLocations._default||{}),...byCourse}:{...(legacyLocations._default||{}),...(legacyLocations.places?.[key]||{})};}
function findRoom(c,site){if(!site)return null;const legacy=legacyLocation(c);const wanted=norm(legacy.room||c.salle||c.room||'');if(!wanted||wanted.includes('confirmer'))return null;return (site.rooms||[]).find(r=>[r.name,...(r.aliases||[])].map(norm).some(n=>n&&(n===wanted||n.includes(wanted)||wanted.includes(n))))||null;}
function guideById(id){return (sitesData.guides||[]).find(g=>String(g.id)===String(id))||null;}
function guideFor(site,room){return room?guideById(room.guideId):guideById(site?.guideId);}
function guideUrl(g){return g?(g.path?siteAsset(g.path):(g.url||'')):'';}

function openRegistration(c){
  if(!c)return;
  $('#registrationCode').textContent=codeOf(c)||'—';
  $('#registrationTitle').textContent=titleOf(c)||'Cours UniPop';
  $('#copyStatus').textContent='';
  showScreen('registrationScreen');
}

async function copyCourseCode(){
  if(!currentCourse)return;
  const code=codeOf(currentCourse).trim();
  if(!code)return;
  try{
    await navigator.clipboard.writeText(code);
    $('#copyStatus').textContent='Code copié ✓';
  }catch{
    const ta=document.createElement('textarea');ta.value=code;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');$('#copyStatus').textContent='Code copié ✓';}catch{$('#copyStatus').textContent='Copie impossible — sélectionnez le code manuellement.';}
    ta.remove();
  }
}

function openUniPopHome(){
  window.open('https://www.unipop.lu/','_blank','noopener,noreferrer');
}


function scheduleSummary(c){const txt=(c.horairePrevu||'').replace(/\n/g,' · ').replace(/\s+/g,' ').trim();return txt||c.duree||'';}
function openCourse(c){if(!c)return;currentCourse=c;currentSite=findSite(c);currentRoom=findRoom(c,currentSite);renderCourse();showScreen('courseScreen');$('#suggestions').classList.add('hidden');}
function renderFavoriteButton(){if(!currentCourse)return;$('#favoriteTop').textContent=isFavorite(currentCourse)?'♥':'♡';}
$('#favoriteTop').onclick=()=>currentCourse&&toggleFavorite(currentCourse);
function renderCourse(){const c=currentCourse,s=currentSite,r=currentRoom;const hero=r?.hero||s?.hero||s?.heroThumb||'';$('#courseHero').style.backgroundImage=hero?`url("${siteAsset(hero)}")`:'linear-gradient(135deg,#0d2e55,#07111f)';$('#courseCode').textContent=codeOf(c);$('#courseCategory').textContent=c.categorieNom||c.langueCoursNom||'';$('#courseTitle').textContent=titleOf(c);const d1=parseDMY(c.dateDebut),d2=parseDMY(c.dateFin);$('#courseDates').textContent=d1?(d2&&d1.getTime()!==d2.getTime()?`${formatDate(d1)} – ${formatDate(d2)}`:formatDate(d1)):(c.dateDebut||'Date à confirmer');$('#courseSchedule').textContent=scheduleSummary(c);$('#courseVenue').textContent=s?.name||venueOf(c);$('#courseRoom').textContent=r?.name||legacyLocation(c).room||'Salle à confirmer';$('#courseDescription').textContent=c.description||c.renseignements||'Les informations détaillées de ce cours sont disponibles dans le catalogue UniPop.';$('#courseAboutSection').classList.toggle('hidden',!($('#courseDescription').textContent));const meta=[];if(c.niveau)meta.push(['Niveau',c.niveau]);if(c.langueCoursNom)meta.push(['Langue',c.langueCoursNom]);if(c.duree)meta.push(['Durée',c.duree]);if(c.nbPlaces)meta.push(['Places',String(c.nbPlaces)]);$('#courseMetaSection').innerHTML=meta.map(([a,b])=>`<div class="meta-card"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');$('#courseMetaSection').classList.toggle('hidden',!meta.length);$('#showLocation').disabled=!s;$('#showLocation').style.opacity=s?'1':'.45';renderFavoriteButton();}
$('#showLocation').onclick=()=>{if(currentSite){renderLocation();showScreen('locationScreen')}};
$('#registerCourse').onclick=()=>openRegistration(currentCourse);
$('#copyCourseCode').onclick=copyCourseCode;
$('#openUnipop').onclick=openUniPopHome;

function renderLocation(){const s=currentSite,r=currentRoom;if(!s)return;$('#locationName').textContent=s.name||venueOf(currentCourse);$('#locationAddress').textContent=s.address||addressOfCourse(currentCourse);$('#locationDescription').textContent=s.description||'';$('#locationDescription').classList.toggle('hidden',!s.description);const hero=s.hero||s.heroThumb;$('#locationHero').style.backgroundImage=hero?`url("${siteAsset(hero)}")`:'linear-gradient(135deg,#123a63,#07111f)';const dest=(s.lat&&s.lng)?`${s.lat},${s.lng}`:encodeURIComponent((s.address||s.name||''));$('#googleMaps').href=`https://www.google.com/maps/search/?api=1&query=${dest}`;$('#appleMaps').href=`https://maps.apple.com/?q=${dest}`;
 const cards=[];if(s.parking)cards.push(['Parking',s.parking,s.parkingInfo]);if(s.transport)cards.push(['Transport public',s.transport,s.transportInfo]);if(s.accessInfo)cards.push(['Accès',s.accessInfo,'']);if(s.pmr)cards.push(['Accessibilité','Accessible PMR','']);$('#accessCards').innerHTML=cards.map(([t,a,b])=>`<div class="stack-card"><strong>${esc(t)} · ${esc(a)}</strong>${b?`<small>${esc(b)}</small>`:''}</div>`).join('');$('#accessSection').classList.toggle('hidden',!cards.length);
 const gallery=[...(s.gallery||[])];$('#gallery').innerHTML=gallery.map(g=>`<img src="${esc(siteAsset(g.path||g.url))}" alt="${esc(g.name||s.name)}">`).join('');$('#gallerySection').classList.toggle('hidden',!gallery.length);
 renderRoom(s,r);renderResources(s,r);renderContact(s);
}
function renderRoom(s,r){const host=$('#roomCard');if(!r){$('#roomSection').classList.add('hidden');host.innerHTML='';return;}const hero=r.hero?`<img src="${esc(siteAsset(r.hero))}" alt="${esc(r.name)}">`:'';const guide=guideFor(s,r),gurl=guideUrl(guide);host.innerHTML=`<article class="room-card">${hero}<div class="room-body"><h4>${esc(r.name)}</h4>${r.floor?`<p><strong>Étage :</strong> ${esc(r.floor)}</p>`:''}${r.directions?`<p><strong>Chemin :</strong> ${esc(r.directions)}</p>`:''}${r.description?`<p>${esc(r.description)}</p>`:''}${(r.equipment||[]).length?`<div class="pills">${r.equipment.map(e=>`<span>${esc(e)}</span>`).join('')}</div>`:''}${gurl?`<a class="resource-link guide-link" target="_blank" rel="noopener" href="${esc(gurl)}">Voir le guide technique <span>→</span></a>`:''}</div></article>`;$('#roomSection').classList.remove('hidden');}
function renderResources(s,r){const host=$('#resources');const items=[];const guide=guideFor(s,r);if(guide&&guideUrl(guide))items.push(['Guide technique',guideUrl(guide),'guide']);for(const p of s.plans||[])if(p.path||p.url)items.push([p.name||p.title||'Plan',p.path?siteAsset(p.path):p.url]);for(const t of s.tutorials||[])if(t.path||t.url)items.push([t.name||t.title||'Tutoriel',t.path?siteAsset(t.path):t.url]);for(const m of s.media||[])if(m.path||m.url)items.push([m.name||m.title||'Média',m.path?siteAsset(m.path):m.url]);host.innerHTML=items.length?`<div class="resource-list">${items.map(([n,u,k])=>`<a class="resource-link ${k==='guide'?'guide-link':''}" href="${esc(u)}" target="_blank" rel="noopener"><span>${esc(n)}</span><span>→</span></a>`).join('')}</div>`:'';$('#resourcesSection').classList.toggle('hidden',!items.length);}
function renderContact(s){const c=[];if(s.website){let u=s.website.trim();if(!/^https?:/i.test(u))u='https://'+u;c.push(['Site web',u,'Ouvrir'])}if(s.phone)c.push([s.phone,'tel:'+s.phone.replace(/\s/g,''),'Appeler']);if(s.email)c.push([s.email.trim(),'mailto:'+s.email.trim(),'Écrire']);$('#contactCards').innerHTML=c.map(([n,u,a])=>`<a class="stack-card" style="text-decoration:none;color:inherit;display:flex;justify-content:space-between;align-items:center" href="${esc(u)}" target="_blank" rel="noopener"><strong>${esc(n)}</strong><small style="margin:0;color:#57a9ff">${a}</small></a>`).join('');$('#contactSection').classList.toggle('hidden',!c.length);}

function renderFavorites(){
  const ids=favorites();
  const list=ids.map(id=>trainings.find(c=>String(c.id)===String(id))).filter(Boolean);
  const host=$('#favoritesList');
  host.innerHTML=list.length?list.map(c=>`<article class="favorite-card" data-id="${esc(c.id)}"><button class="favorite-open" type="button"><div><h3>${esc(titleOf(c))}</h3><p>${esc(codeOf(c))} · ${esc(c.dateDebut||'')}</p><p>${esc(venueOf(c))}</p></div><span class="chev">›</span></button><button class="favorite-remove" type="button" aria-label="Supprimer des favoris">Supprimer</button></article>`).join(''):`<div class="empty">Vous n'avez encore enregistré aucun cours.</div>`;
  host.querySelectorAll('.favorite-open').forEach(el=>el.onclick=()=>{const card=el.closest('.favorite-card');openCourse(trainings.find(c=>String(c.id)===card.dataset.id));});
  host.querySelectorAll('.favorite-remove').forEach(el=>el.onclick=()=>{const card=el.closest('.favorite-card');saveFavorites(favorites().filter(id=>String(id)!==String(card.dataset.id)));renderFavorites();if(currentCourse)renderFavoriteButton();});
}

async function loadData(){try{const [rt,rs,rl]=await Promise.all([fetch(DATA_URL,{cache:'no-store'}),fetch(SITES_URL+'?v='+Date.now(),{cache:'no-store'}).catch(()=>null),fetch(LOCATIONS_URL+'?v='+Date.now(),{cache:'no-store'}).catch(()=>null)]);if(!rt.ok)throw new Error('Catalogue');trainings=await rt.json();if(rs?.ok){const d=await rs.json();if(Array.isArray(d.locations))sitesData=d;}if(rl?.ok)legacyLocations=await rl.json();$('#catalogueStatus').textContent=`${upcomingCourses().length} cours disponibles`;renderFavorites();}catch(e){console.error(e);$('#catalogueStatus').textContent='Catalogue indisponible — vérifiez votre connexion.'}}
loadData();

if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js?v=3').catch(()=>{});}
