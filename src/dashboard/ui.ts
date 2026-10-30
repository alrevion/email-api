// Self-contained mail client SPA (HTML + CSS + vanilla JS). Served at GET / (email.alrevion.com).
// Talks to /dashboard/api/* (cookie session). Look: Onest, light-gray backdrop, white sheets, blue accent #407bd8.
// Icons: Lucide (ISC), inlined as SVG paths.
// NOTE: client JS avoids backticks and ${ to keep this a clean template literal; escape "\" as "\\".

const LOGO =
  '<svg viewBox="6 5 52 54" aria-hidden="true"><path d="M11 54 L32 10 L53 54" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="38.5" r="6" fill="#fff"/></svg>';

export const DASHBOARD_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Alrevion Mail</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--paper:#f1f3f6;--sheet:#fff;--ink:#0f1115;--ink-2:#353a43;--muted:#5b616b;--dim:#7d838d;--line:#e4e7ec;--line-2:#eef0f3;
  --hover:#f5f7fa;--sel:#edf3fc;--accent:#407bd8;--accent-h:#3569bf;--accent-soft:#e8f0fc;--on-accent:#fff;--mark:#407bd8;
  --danger:#d32f2f;--danger-soft:#fdeeee;--btn:#407bd8;--btn-ink:#fff;
  --ring:rgba(64,123,216,.35);--shadow:0 1px 2px rgba(15,17,21,.05),0 4px 16px rgba(15,17,21,.06);--shadow-lg:0 24px 64px rgba(15,17,21,.2);
  --toast:#0f1115;--toast-ink:#f5f5f5;--toast-act:#8db4f2;--font:"Onest",system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#0a0c10;--sheet:#12151a;--ink:#f3f4f6;--ink-2:#d4d8de;--muted:#aab0b9;--dim:#858b95;
  --line:#1f232a;--line-2:#181b21;--hover:#171b21;--sel:#1a2333;--accent:#5b8fe3;--accent-h:#76a2ea;--accent-soft:rgba(91,143,227,.16);--mark:#6f9ce6;
  --danger:#ff6b6b;--danger-soft:rgba(255,107,107,.1);--btn:#5b8fe3;--btn-ink:#fff;--ring:rgba(111,156,230,.4);
  --shadow:0 1px 2px rgba(0,0,0,.4);--shadow-lg:0 24px 64px rgba(0,0,0,.6);--toast:#f3f4f6;--toast-ink:#0f1115;--toast-act:#2f63b8}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;font:14px/1.5 var(--font);color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}
button{font:inherit;cursor:pointer;color:inherit;touch-action:manipulation}
input,textarea{font:inherit;color:var(--ink)}
:focus-visible{outline:2px solid var(--mark);outline-offset:2px}
.hidden{display:none!important}
.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.input{width:100%;height:44px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:var(--sheet);outline:none;transition:border-color .15s,box-shadow .15s}
.input:focus{border-color:var(--mark);box-shadow:0 0 0 3px var(--ring)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 14px;border:1px solid var(--line);
  border-radius:10px;background:var(--sheet);font-weight:500;white-space:nowrap;transition:background .15s,border-color .15s,transform .1s}
.btn:hover{background:var(--hover)}.btn:active{transform:scale(.97)}
.btn.primary{background:var(--btn);border-color:var(--btn);color:var(--btn-ink);font-weight:600}.btn.primary:hover{background:var(--accent-h);border-color:var(--accent-h)}
.btn.ghost{background:transparent;border-color:transparent}.btn.ghost:hover{background:var(--hover)}
.btn.danger{color:var(--danger)}.btn.danger:hover{background:var(--danger-soft);border-color:transparent}
.btn.icon{width:36px;padding:0}
.btn[disabled]{opacity:.5;cursor:default;transform:none}
.err{color:var(--danger);font-size:13px}.err:empty{display:none}
.mark{width:32px;height:32px;border-radius:9px;background:#407bd8;display:grid;place-items:center;flex:none}
.mark svg{width:19px;height:19px}
/* login */
.login{min-height:100%;display:grid;place-items:center;padding:24px}
.login form{width:100%;max-width:380px;background:var(--sheet);border:1px solid var(--line);border-radius:20px;padding:36px 32px 32px;box-shadow:var(--shadow)}
.login .mark{width:44px;height:44px;border-radius:12px}.login .mark svg{width:26px;height:26px}
.login h1{font-size:22px;font-weight:600;letter-spacing:-.01em;margin:20px 0 4px}.login p{margin:0 0 24px;color:var(--muted)}
.field{display:block;margin-bottom:16px}.field span{display:block;font-size:13px;font-weight:500;color:var(--ink-2);margin-bottom:6px}
.login .btn{width:100%;height:46px;margin-top:4px;font-size:15px}.login .err{margin-top:12px}
/* shell */
.app{height:100%;display:grid;grid-template-rows:64px 1fr}
.top{display:flex;align-items:center;gap:12px;padding:0 16px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:16px;letter-spacing:-.01em;width:232px;flex:none;padding-left:4px}
.search{position:relative;flex:1;max-width:720px}.search .ic{position:absolute;left:14px;top:13px;color:var(--dim)}
.search .input{padding-left:42px}
.main{display:grid;grid-template-columns:248px minmax(300px,400px) 1fr;min-height:0;padding:0 16px 16px 0}
.side{padding:4px 12px 8px 16px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.compose-btn{display:inline-flex;align-items:center;gap:12px;height:52px;padding:0 22px 0 18px;align-self:flex-start;border:0;border-radius:16px;
  background:var(--accent);color:var(--on-accent);font-size:15px;font-weight:600;box-shadow:0 2px 8px rgba(64,123,216,.3);transition:background .15s,transform .1s}
.compose-btn:hover{background:var(--accent-h)}.compose-btn:active{transform:scale(.97)}
.folders{display:flex;flex-direction:column;gap:2px}
.fold{position:relative;display:flex;align-items:center;gap:14px;width:100%;height:40px;padding:0 12px 0 14px;border:0;background:none;border-radius:10px;
  text-align:left;color:var(--ink-2);transition:background .15s}
.fold span:nth-child(2){flex:1}.fold:hover{background:var(--hover)}
.fold.active{background:var(--sheet);color:var(--accent);font-weight:600;box-shadow:var(--shadow)}
.fold.active:before{content:"";position:absolute;left:0;top:11px;bottom:11px;width:3px;border-radius:3px;background:var(--mark)}
.cnt{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dim)}
.cnt.pill{min-width:22px;padding:1px 7px;border-radius:999px;background:var(--accent);color:var(--on-accent);text-align:center}
.logout{margin-top:auto;color:var(--muted)}
.dd{position:relative}
.dd-btn{display:flex;align-items:center;gap:10px;width:100%;height:40px;padding:0 10px 0 14px;border:1px solid var(--line);border-radius:10px;background:transparent;text-align:left;color:var(--ink-2)}
.dd-btn:hover{background:var(--hover)}.dd-val{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dd-btn .ic{color:var(--dim)}
.dd-menu{position:absolute;z-index:30;top:calc(100% + 6px);left:0;min-width:100%;max-height:300px;overflow:auto;background:var(--sheet);
  border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-lg);padding:4px}
.dd-opt{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:none;text-align:left;white-space:nowrap}
.dd-opt:hover{background:var(--hover)}.dd-opt.on{font-weight:600;color:var(--accent)}
/* list + reading pane form one sheet */
.list{background:var(--sheet);border:1px solid var(--line);border-right:0;border-radius:16px 0 0 16px;overflow:auto}
.pane{background:var(--sheet);border:1px solid var(--line);border-radius:0 16px 16px 0;overflow:auto;padding:28px 36px;min-width:0}
.row{display:grid;grid-template-columns:36px 1fr;gap:12px;padding:12px 16px 12px 18px;border-bottom:1px solid var(--line-2);cursor:pointer;position:relative;transition:background .12s}
.row:hover{background:var(--hover)}.row.active{background:var(--sel)}
.row.unread:before{content:"";position:absolute;left:6px;top:26px;width:6px;height:6px;border-radius:50%;background:var(--mark)}
.rmain{min-width:0}
.r1{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.from,.subj,.snip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.from{color:var(--ink-2);font-weight:500}.subj{color:var(--ink-2)}
.row.unread .from,.row.unread .subj{color:var(--ink);font-weight:600}
.n{color:var(--dim);font-weight:400;margin-left:6px;font-size:12px}
.time{color:var(--dim);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}.snip{color:var(--dim);font-size:13px}
.tag{display:inline-flex;align-items:center;gap:3px;margin-left:8px;color:var(--dim);font-size:12px;font-weight:400;vertical-align:-2px}
.tag .ic{width:14px;height:14px}.tag.bad{color:var(--danger)}
.av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:600;color:#0b0c0e;letter-spacing:.02em;flex:none;user-select:none}
.av.own{font-size:11px}
.more{width:100%;padding:14px;border:0;background:none;color:var(--muted)}
.blank{padding:48px 24px;text-align:center;color:var(--dim)}
.empty{height:100%;display:grid;place-items:center;align-content:center;gap:12px;color:var(--dim);text-align:center}.empty .ic{width:44px;height:44px;stroke-width:1.3}
/* thread */
.thead h2{font-size:22px;font-weight:600;letter-spacing:-.015em;line-height:1.3;margin:0 0 16px;max-width:780px}
.acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-bottom:20px;border-bottom:1px solid var(--line-2)}.acts .sp{flex:1}
.grp{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.grp .btn{border:0;border-radius:0;height:34px}.grp .btn+.btn{border-left:1px solid var(--line)}
.msg{padding:22px 0;border-bottom:1px solid var(--line-2);max-width:820px}
.mhead{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center}
.mhead .av{width:40px;height:40px}
.mwho{min-width:0}.mname{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.maddr{color:var(--dim);font-weight:400;font-size:13px}.mto{color:var(--dim);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mfail{display:inline-flex;align-items:center;gap:6px;margin:10px 0 0 52px;color:var(--danger);font-size:13px}
.mbody{padding:14px 0 0 52px}
.mbody pre{white-space:pre-wrap;word-break:break-word;margin:0;font:15px/1.6 var(--font);color:var(--ink)}
.mbody iframe{width:100%;border:0;min-height:24px;background:#fff}
.quoted{color:var(--muted)!important;margin-top:12px!important;font-size:14px!important}
.qbtn{display:inline-flex;align-items:center;height:28px;margin-top:12px;padding:0 10px;font-size:12px;color:var(--muted);background:var(--hover);border:0;border-radius:8px}
.qbtn:hover{background:var(--sel)}
.atts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.att{display:inline-flex;align-items:center;gap:8px;font-size:13px;border:1px solid var(--line);border-radius:10px;padding:7px 12px;color:var(--ink);text-decoration:none;background:var(--sheet)}
.att .ic{width:15px;height:15px;color:var(--accent)}.att small{color:var(--dim);font-size:12px}.att:hover{border-color:var(--accent);background:var(--accent-soft)}
/* compose */
.modal{position:fixed;inset:0;background:rgba(11,12,14,.45);display:flex;align-items:center;justify-content:center;padding:24px;z-index:50}
.compose{display:flex;flex-direction:column;background:var(--sheet);border-radius:18px;width:100%;max-width:780px;max-height:100%;overflow:hidden;box-shadow:var(--shadow-lg);animation:pop .18s ease-out}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.985)}}
.chdr{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 12px 20px;border-bottom:1px solid var(--line)}
.chdr h2{margin:0;font-size:15px;font-weight:600}
.crow{display:grid;grid-template-columns:56px 1fr;align-items:center;gap:8px;min-height:48px;padding:0 20px;border-bottom:1px solid var(--line-2)}
.crow>span{color:var(--dim);font-size:14px}
.cin{width:100%;height:46px;border:0;outline:none;background:transparent;font-size:15px}
.crow .dd-btn{border:0;padding:0;height:46px;background:transparent;color:var(--ink);font-size:15px}.crow .dd-btn:hover{background:transparent}
.cbody-in{flex:1;min-height:38vh;width:100%;border:0;outline:none;resize:none;padding:18px 20px;background:transparent;font:15px/1.6 var(--font)}
.cextra{padding:0 20px}.cextra .quoted{white-space:pre-wrap;word-break:break-word;margin:8px 0 0;font:13px/1.55 var(--font);max-height:220px;overflow:auto;border-left:2px solid var(--line);padding-left:12px}
.note{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--dim)}.note .ic{width:15px;height:15px}
.compose .err{padding:8px 20px 0}
.cbar{display:flex;gap:8px;align-items:center;padding:14px 16px 16px 20px}.cbar .sp{flex:1}.cbar .btn.primary{height:40px;padding:0 18px}
/* toast */
.toast{position:fixed;left:24px;bottom:24px;z-index:60;display:flex;align-items:center;gap:14px;min-width:320px;max-width:calc(100% - 48px);
  padding:12px 10px 12px 16px;border-radius:14px;background:var(--toast);color:var(--toast-ink);box-shadow:var(--shadow-lg);transition:opacity .2s,transform .2s}
.toast.off{opacity:0;transform:translateY(12px);pointer-events:none}.toast .msg{flex:1}
.toast .act{border:0;background:none;color:var(--toast-act);font-weight:600;padding:6px 8px;border-radius:8px}
.toast .x{border:0;background:none;color:inherit;opacity:.6;padding:6px;display:grid}.toast.bad>.ic{color:#ff6b6b}
.fab,.scrim,.back,#menuBtn{display:none}
@media(max-width:900px){
  .input,.cin,.cbody-in{font-size:16px}.btn{height:44px}.btn.icon{width:44px}.grp .btn{height:42px}
  .brand{display:none}.side .compose-btn{display:none}.top{padding:0 12px;gap:8px}
  .main{grid-template-columns:1fr;padding:0}.list{border-radius:0;border:0;border-top:1px solid var(--line)}
  .pane{display:none;border-radius:0;border:0;padding:16px}.app.reading .list{display:none}.app.reading .pane{display:block}
  .back,#menuBtn{display:inline-flex}.acts{flex-wrap:nowrap;gap:6px}.acts .lbl{display:none}.acts .btn{width:44px;padding:0;flex:none}
  .grp .btn{width:42px}.msg{padding:18px 0}.mbody{padding-left:0}.mfail{margin-left:0}.thead h2{font-size:20px}
  .side{position:fixed;z-index:40;top:0;bottom:0;left:0;width:284px;padding:16px 12px;transform:translateX(-100%);transition:transform .2s ease-out;background:var(--sheet)}
  .side.open{transform:none}.scrim.open{display:block;position:fixed;inset:0;z-index:35;background:rgba(11,12,14,.45)}
  .fab{display:grid;place-items:center;position:fixed;right:20px;bottom:20px;z-index:20;width:58px;height:58px;border-radius:18px;border:0;
    background:var(--accent);color:var(--on-accent);box-shadow:0 8px 24px rgba(64,123,216,.4);transition:transform .2s}.fab .ic{width:22px;height:22px;stroke-width:2}
  .app.reading~.fab{display:none}body.toasting .fab{transform:translateY(-72px)}
  .toast{left:12px;right:12px;bottom:12px;min-width:0;max-width:none}
  .modal{padding:0}.compose{border-radius:0;height:100%;max-width:none}.crow{padding:0 16px;grid-template-columns:48px 1fr}.cbody-in{padding:16px}.cextra{padding:0 16px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div id="login" class="login">
  <form id="loginForm">
    <div class="mark">${LOGO}</div>
    <h1>Alrevion Mail</h1>
    <p>Войдите, чтобы открыть почту.</p>
    <label class="field"><span>Логин</span><input class="input" id="lg" autocomplete="username" autofocus required></label>
    <label class="field"><span>Пароль</span><input class="input" type="password" id="pw" autocomplete="current-password" required></label>
    <button class="btn primary" id="loginBtn">Войти</button>
    <div class="err" id="loginErr" role="alert"></div>
  </form>
</div>

<div id="app" class="app hidden">
  <div class="top">
    <button class="btn icon ghost" id="menuBtn" aria-label="Меню"><span data-ic="menu"></span></button>
    <div class="brand"><span class="mark">${LOGO}</span>Alrevion Mail</div>
    <label class="search"><span data-ic="search"></span><input class="input" id="q" type="search" placeholder="Поиск в почте" aria-label="Поиск в почте"></label>
  </div>
  <div class="main">
    <nav class="side" id="side" aria-label="Папки">
      <button class="compose-btn" id="newBtn"><span data-ic="pencil"></span>Написать</button>
      <div id="box"></div>
      <div class="folders" id="folders"></div>
      <button class="fold logout" id="logoutBtn"><span data-ic="logout"></span><span>Выйти</span></button>
    </nav>
    <div class="list"><div id="rows"></div><button class="more hidden" id="moreBtn">Показать ещё</button></div>
    <main class="pane" id="pane"></main>
  </div>
</div>
<button class="fab" id="fab" aria-label="Написать"><span data-ic="pencil"></span></button>
<div class="scrim" id="scrim"></div>
<div class="toast off" id="toast" role="status" aria-live="polite"></div>
<div class="modal hidden" id="modal"></div>

<script>
(function(){
  var I={menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    mail:'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    pencil:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    archive:'<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    send:'<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5"/>',
    trash:'<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    bell:'<path d="M10.268 21a2 2 0 0 0 3.464 0M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    reply:'<path d="M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4"/>',forward:'<path d="m15 17 5-5-5-5M4 18v-2a4 4 0 0 1 4-4h12"/>',
    image:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    back:'<path d="m12 19-7-7 7-7M19 12H5"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',chev:'<path d="m6 9 6 6 6-6"/>',check:'<path d="M20 6 9 17l-5-5"/>',
    clip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',at:'<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    loader:'<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'};
  function ic(n,cls){return '<svg class="ic'+(cls?" "+cls:"")+'" viewBox="0 0 24 24" aria-hidden="true">'+I[n]+'</svg>';}
  Array.prototype.forEach.call(document.querySelectorAll("[data-ic]"),function(e){e.innerHTML=ic(e.getAttribute("data-ic"));});
  var FOLDERS=[["inbox","Входящие","inbox"],["archive","Архив","archive"],["sent","Отправленные","send"],["drafts","Черновики","file"],
    ["trash","Корзина","trash"],["system","Системные","bell"]];
  var S={folder:"inbox",box:"",q:"",offset:0,senders:[],unread:{},drafts:0,thread:null,tid:null,images:false};
  var el=function(id){return document.getElementById(id)};
  function api(path,opts){opts=opts||{};opts.credentials="same-origin";
    opts.headers=Object.assign({"Content-Type":"application/json"},opts.headers||{});
    return fetch("/dashboard/api"+path,opts).then(function(r){if(r.status===401){showLogin();throw new Error("auth");}return r;});}
  function j(r){return r.json();}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c];});}
  function when(ts,full){if(!ts)return"";var d=new Date(ts.replace(" ","T")+"Z");if(isNaN(d))return ts;
    var today=new Date().toDateString()===d.toDateString();
    return d.toLocaleString("ru-RU",full?{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}:
      (today?{hour:"2-digit",minute:"2-digit"}:{day:"numeric",month:"short"}));}
  function size(n){return n>1048576?(n/1048576).toFixed(1)+" МБ":Math.max(1,Math.round(n/1024))+" КБ";}
  function atts(json){try{return JSON.parse(json||"[]")||[]}catch(e){return[]}}
  function uuid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2,10);}
  // Initials on a soft tint picked from the name; own messages get the accent blue.
  var AV=["#e3ecfb","#e6f4ee","#f6ebe0","#ece6f7","#fbe7ec","#e8eef3","#f3f0dc"];
  function av(name,own){var s=String(name||"?").trim(),h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;
    var w=s.split(/[\\s@._-]+/).filter(Boolean),t=own?"Вы":((w[0]||"?").charAt(0)+(w[1]&&s.indexOf("@")<0?w[1].charAt(0):"")).toUpperCase();
    return '<span class="av'+(own?" own":"")+'" style="'+(own?"background:#407bd8;color:#fff":"background:"+AV[Math.abs(h)%AV.length])+'" aria-hidden="true">'+esc(t)+'</span>';}

  // ---- toast: one at a time, bottom-left; sticky ones carry a close button ----
  var tt;
  function toast(t,o){o=o||{};var x=el("toast");clearTimeout(tt);
    x.className="toast"+(o.bad?" bad":"");document.body.classList.add("toasting");
    x.innerHTML=(o.icon?ic(o.icon,o.icon==="loader"?"spin":""):"")+'<span class="msg">'+esc(t)+'</span>'+
      (o.action?'<button class="act">'+esc(o.action)+'</button>':"")+(o.sticky?'<button class="x" aria-label="Закрыть">'+ic("x")+'</button>':"");
    if(o.action)x.querySelector(".act").onclick=o.onAction;
    if(o.sticky)x.querySelector(".x").onclick=hideToast;
    else if(!o.keep)tt=setTimeout(hideToast,3500);}
  function hideToast(){el("toast").classList.add("off");document.body.classList.remove("toasting");}

  // ---- dropdown in our style (listbox of buttons); closes on outside click / Esc ----
  function dropdown(host,o){var value=o.value||"";host.className="dd";
    function render(){var cur=o.items.filter(function(it){return it.v===value})[0]||o.items[0];
      host.innerHTML='<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false">'+(o.icon?ic(o.icon):"")+
        '<span class="dd-val">'+esc(cur?cur.label:"")+'</span>'+ic("chev")+'</button><div class="dd-menu hidden" role="listbox">'+
        o.items.map(function(it){var on=it.v===value;return '<button type="button" role="option" aria-selected="'+on+'" class="dd-opt'+(on?" on":"")+
          '" data-v="'+esc(it.v)+'"><span>'+esc(it.label)+'</span>'+(on?ic("check"):"")+'</button>';}).join("")+'</div>';}
    host.onclick=function(e){var opt=e.target.closest(".dd-opt");
      if(opt){value=opt.getAttribute("data-v");render();if(o.onChange)o.onChange(value);return;}
      if(e.target.closest(".dd-btn")){var m=host.querySelector(".dd-menu"),open=m.classList.toggle("hidden")===false;
        host.querySelector(".dd-btn").setAttribute("aria-expanded",open);}};
    render();return{get:function(){return value}};}
  function closeMenus(except){var n=0;Array.prototype.forEach.call(document.querySelectorAll(".dd-menu:not(.hidden)"),function(m){
    if(!except||!except.contains(m)){n++;m.classList.add("hidden");m.previousSibling.setAttribute("aria-expanded","false");}});return n;}
  document.addEventListener("click",function(e){closeMenus(e.target.closest(".dd"));});
  // Esc closes an open menu first; the modal only sees an Esc nothing else consumed.
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&closeMenus())e.preventDefault();});

  // ---- auth ----
  var poll=null;
  function showApp(){el("login").classList.add("hidden");el("app").classList.remove("hidden");emptyPane();
    loadBoxes().then(loadList);clearInterval(poll);poll=setInterval(function(){loadBoxes();if(!S.offset)loadList(true);},30000);}
  function showLogin(){clearInterval(poll);el("app").classList.add("hidden");el("login").classList.remove("hidden");}
  el("loginForm").addEventListener("submit",function(e){e.preventDefault();var b=el("loginBtn");b.disabled=true;el("loginErr").textContent="";
    fetch("/dashboard/api/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({login:el("lg").value,password:el("pw").value})}).then(function(r){b.disabled=false;
      if(r.ok){el("pw").value="";showApp();}
      else el("loginErr").textContent=r.status===429?"Слишком много попыток. Вход с этого IP закрыт на 24 часа.":r.status===503?"Логин и пароль не настроены на сервере.":"Неверный логин или пароль.";
    }).catch(function(){b.disabled=false;el("loginErr").textContent="Нет связи с сервером. Проверьте интернет.";});});
  el("logoutBtn").addEventListener("click",function(){api("/logout",{method:"POST"}).finally(showLogin);});

  // ---- sidebar ----
  var boxDD=null;
  function loadBoxes(){return api("/boxes").then(j).then(function(d){S.senders=d.senders||[];S.unread=d.unread||{};S.drafts=d.drafts||0;
    if(!boxDD)boxDD=dropdown(el("box"),{icon:"at",value:S.box,items:[{v:"",label:"Все ящики"}].concat(S.senders.map(function(s){return{v:s,label:s}})),
      onChange:function(v){S.box=v;S.offset=0;loadList();}});
    renderFolders();}).catch(function(){});}
  function renderFolders(){el("folders").innerHTML=FOLDERS.map(function(f){var dr=f[0]==="drafts",n=dr?S.drafts:S.unread[f[0]];
    return '<button class="fold'+(S.folder===f[0]?" active":"")+'" data-f="'+f[0]+'"'+(S.folder===f[0]?' aria-current="page"':"")+'>'+ic(f[2])+
      '<span>'+f[1]+'</span>'+(n?'<span class="cnt'+(f[0]==="inbox"?" pill":"")+'">'+n+'</span>':"")+'</button>';}).join("");
    var total=S.unread.inbox||0;document.title=(total?"("+total+") ":"")+"Alrevion Mail";}
  function drawer(open){el("side").classList.toggle("open",open);el("scrim").classList.toggle("open",open);}
  el("folders").addEventListener("click",function(e){var b=e.target.closest(".fold");if(!b)return;
    S.folder=b.getAttribute("data-f");S.offset=0;renderFolders();drawer(false);el("app").classList.remove("reading");loadList();});
  var qt;el("q").addEventListener("input",function(){clearTimeout(qt);var v=this.value;qt=setTimeout(function(){S.q=v.trim();S.offset=0;loadList();},300);});
  el("menuBtn").addEventListener("click",function(){drawer(true);});
  el("scrim").addEventListener("click",function(){drawer(false);});
  el("newBtn").addEventListener("click",function(){compose(stNew());});
  el("fab").addEventListener("click",function(){compose(stNew());});

  // ---- list ----
  var listSeq=0;
  function blank(){return '<div class="blank">'+(S.q?"Ничего не нашлось. Попробуйте другой запрос.":S.folder==="drafts"?"Черновиков нет.":"Здесь пока пусто.")+'</div>';}
  function rowEl(avatar,who,n,time,subj,tags,snip){var div=document.createElement("div");div.className="row";div.tabIndex=0;
    div.innerHTML=avatar+'<div class="rmain"><div class="r1"><span class="from">'+esc(who)+(n>1?'<span class="n">'+n+'</span>':"")+'</span>'+
      '<span class="time">'+esc(time)+'</span></div><div class="subj">'+esc(subj||"(без темы)")+tags+'</div><div class="snip">'+esc(snip||"")+'</div></div>';
    return div;}
  function onOpen(div,fn){div.onclick=div.onkeydown=function(e){if(e.type==="keydown"&&e.key!=="Enter")return;fn();};}
  function loadList(quiet){var seq=++listSeq;
    if(S.folder==="drafts")return loadDrafts(seq);
    var qs="?folder="+S.folder+"&offset="+S.offset+"&box="+encodeURIComponent(S.box)+"&q="+encodeURIComponent(S.q);
    return api("/list"+qs).then(j).then(function(d){if(seq!==listSeq)return;var rows=el("rows");var msgs=d.messages||[];
      if(!S.offset)rows.innerHTML=msgs.length?"":blank();
      msgs.forEach(function(m){var who=m.kind==="out"?"Кому: "+m.addr:(m.name||m.addr);
        var tags=(m.replied?'<span class="tag" title="Отвечено">'+ic("reply")+'</span>':"")+
          (atts(m.attachments).length?'<span class="tag" title="Есть вложения">'+ic("clip")+'</span>':"")+(m.status==="failed"?'<span class="tag bad">не отправлено</span>':"");
        var div=rowEl(av(m.kind==="out"?m.addr:(m.name||m.addr)),who,m.n,when(m.at),m.subject,tags,m.snippet);
        if(m.unread)div.classList.add("unread");if(m.thread_id===S.tid)div.classList.add("active");
        onOpen(div,function(){Array.prototype.forEach.call(document.querySelectorAll(".row.active"),function(r){r.classList.remove("active")});
          div.classList.add("active");div.classList.remove("unread");openThread(m.thread_id);});
        rows.appendChild(div);});
      el("moreBtn").classList.toggle("hidden",msgs.length<50);
    }).catch(function(){if(!quiet)toast("Не удалось загрузить письма",{icon:"alert",bad:true});});}
  function loadDrafts(seq){return api("/drafts").then(j).then(function(d){if(seq!==listSeq)return;var q=S.q.toLowerCase();
    var ds=(d.drafts||[]).filter(function(x){return(!S.box||x.from_addr.toLowerCase()===S.box.toLowerCase())&&
      (!q||(x.to_addr+" "+x.subject+" "+x.body).toLowerCase().indexOf(q)>=0);});
    var rows=el("rows");rows.innerHTML=ds.length?"":blank();el("moreBtn").classList.add("hidden");
    ds.forEach(function(x){var div=rowEl(av(x.to_addr||"?"),x.to_addr?"Кому: "+x.to_addr:"Без получателя",0,when(x.updated_at),x.subject,"",x.body);
      onOpen(div,function(){compose(stDraft(x));});rows.appendChild(div);});})
    .catch(function(){toast("Не удалось загрузить черновики",{icon:"alert",bad:true});});}
  el("moreBtn").addEventListener("click",function(){S.offset+=50;loadList();});

  // ---- thread ----
  function emptyPane(){el("pane").innerHTML='<div class="empty">'+ic("mail")+'<span>Выберите письмо в списке</span></div>';}
  function openThread(tid){S.tid=tid;el("app").classList.add("reading");
    api("/thread/"+encodeURIComponent(tid)).then(j).then(function(d){S.thread=d.messages||[];S.images=false;renderThread();loadBoxes();if(!S.offset)loadList(true);})
      .catch(function(){toast("Переписка не найдена",{icon:"alert",bad:true});});}
  function reloadThread(){if(!S.tid)return;api("/thread/"+encodeURIComponent(S.tid)).then(j).then(function(d){S.thread=d.messages||[];renderThread();}).catch(function(){});}
  function abtn(a,icon,label,cls){return '<button class="btn'+(cls?" "+cls:"")+'" data-a="'+a+'" aria-label="'+label+'" title="'+label+'">'+ic(icon)+'<span class="lbl">'+label+'</span></button>';}
  function renderThread(){var ms=S.thread;if(!ms.length){emptyPane();return;}
    var last=ms[ms.length-1],lastIn=null;ms.forEach(function(m){if(m.kind==="in")lastIn=m;});
    var folder=lastIn?lastIn.folder:null,subj=(ms[0].subject||"(без темы)");
    var acts='<button class="btn icon ghost back" data-a="back" aria-label="Назад">'+ic("back")+'</button>';
    if(lastIn)acts+=abtn("reply","reply","Ответить","primary");
    var g=abtn("forward","forward","Переслать");
    if(folder==="inbox")g+=abtn("archive","archive","В архив");
    if(folder&&folder!=="inbox")g+=abtn("inbox","inbox","Во входящие");
    if(folder)g+=abtn("unread","mail","Непрочитано");
    if(!S.images&&ms.some(function(m){return m.html&&/<img|url[(]/i.test(m.html)}))g+=abtn("images","image","Картинки");
    acts+='<div class="grp">'+g+'</div><span class="sp"></span>';
    if(folder&&folder!=="trash")acts+=abtn("trash","trash","В корзину","danger");
    if(folder==="trash")acts+=abtn("purge","trash","Удалить навсегда","danger");
    var h='<div class="thead"><h2>'+esc(subj)+'</h2><div class="acts">'+acts+'</div></div>';
    // Newest message first; attachments on top of its body; quoted history folded behind a button.
    ms.map(function(m,i){return i}).reverse().forEach(function(i){var m=ms[i],inb=m.kind==="in";
      var name=inb?(m.from_name||m.from):"Вы";
      h+='<article class="msg"><div class="mhead">'+av(inb?name:"",!inb)+'<div class="mwho"><div class="mname">'+esc(name)+
        (inb&&m.from_name?' <span class="maddr">'+esc(m.from)+'</span>':"")+'</div><div class="mto">кому: '+esc(m.to)+'</div></div>'+
        '<span class="time">'+esc(when(m.at,true))+'</span></div>'+
        (m.status==="failed"?'<div class="mfail">'+ic("alert")+'Не отправлено: '+esc(m.error||"")+'</div>':"");
      var q=m.html?["",""]:splitQuote(m.text||"(пусто)");
      h+='<div class="mbody">'+(m.attachments.length?'<div class="atts">'+m.attachments.map(function(a,k){
          return '<a class="att" href="/dashboard/api/attachment/'+m.kind+'/'+encodeURIComponent(m.id)+'/'+k+'">'+ic("clip")+esc(a.name)+(a.size?' <small>'+size(a.size)+'</small>':"")+'</a>';}).join("")+'</div>':"")+
        (m.html?'<iframe data-i="'+i+'" title="Текст письма" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>':
          '<pre>'+esc(q[0])+'</pre>'+(q[1]?'<pre class="quoted hidden">'+esc(q[1])+'</pre>':""))+
        '<button class="qbtn'+(q[1]?"":" hidden")+'">Показать цитату</button></div></article>';});
    var pane=el("pane");pane.innerHTML=h;pane.scrollTop=0;
    Array.prototype.forEach.call(pane.querySelectorAll("iframe[data-i]"),function(f){var m=ms[+f.getAttribute("data-i")];
      f.addEventListener("load",function(){try{var d=f.contentDocument,qn=d.querySelector(QUOTE_SEL);
        // Fold the quote and everything after it (Outlook puts the history after a marker) into one hidden wrapper.
        if(qn&&qn.parentNode){var w=d.createElement("div");qn.parentNode.insertBefore(w,qn);while(w.nextSibling)w.appendChild(w.nextSibling);
          w.style.display="none";var b=f.parentNode.querySelector(".qbtn");b._q=w;b.classList.remove("hidden");}}catch(e){}
        fit(f);});
      var csp=S.images?"default-src 'none'; img-src * data:; style-src * 'unsafe-inline'; font-src *":"default-src 'none'; img-src data:; style-src 'unsafe-inline'";
      f.srcdoc='<meta http-equiv="Content-Security-Policy" content="'+csp+'"><base target="_blank"><meta name="referrer" content="no-referrer"><style>body{margin:0;font:15px/1.6 -apple-system,Arial,sans-serif;color:#16181d;word-break:break-word}img{max-width:100%;height:auto}</style>'+m.html;});
    pane.querySelector(".acts").addEventListener("click",function(e){var b=e.target.closest("[data-a]");if(!b)return;act(b.getAttribute("data-a"),lastIn,last);});}
  // Quote markers of Gmail, Apple Mail, Outlook, Yahoo, Thunderbird.
  var QUOTE_SEL=".gmail_quote,blockquote[type=cite],#appendonsend,#divRplyFwdMsg,.yahoo_quoted,.moz-cite-prefix";
  // Plain text: split at the first "> " line, taking the "On …, X wrote:" lines above it along.
  function splitQuote(t){var ls=t.split("\\n");
    for(var i=0;i<ls.length;i++){if(ls[i].charAt(0)!==">")continue;
      var s=i;if(s&&/:\\s*$/.test(ls[s-1])){s--;while(s&&ls[s-1].trim()&&i-s<3)s--;}
      var main=ls.slice(0,s).join("\\n").replace(/\\s+$/,"");
      return main.trim()?[main,ls.slice(s).join("\\n")]:[t,""];}
    return [t,""];}
  // Shrink first: scrollHeight never reports less than the current frame height.
  function fit(f){try{f.style.height="1px";f.style.height=Math.min(f.contentDocument.documentElement.scrollHeight+8,4000)+"px";}catch(e){f.style.height="500px";}}
  el("pane").addEventListener("click",function(e){var b=e.target.closest(".qbtn");if(!b)return;
    var open=b.textContent==="Показать цитату",txt=b.parentNode.querySelector(".quoted"),f=b.parentNode.querySelector("iframe");
    if(b._q)b._q.style.display=open?"":"none";else if(txt)txt.classList.toggle("hidden",!open);
    b.textContent=open?"Скрыть цитату":"Показать цитату";if(f)fit(f);});
  function act(a,lastIn,last){var tid=S.tid;
    if(a==="back"){el("app").classList.remove("reading");return;}
    if(a==="images"){S.images=true;renderThread();return;}
    if(a==="reply"){compose(stReply(lastIn));return;}
    if(a==="forward"){compose(stForward(last));return;}
    if(a==="purge"&&!confirm("Удалить переписку навсегда? Восстановить её будет нельзя."))return;
    var req=a==="unread"?api("/thread/"+encodeURIComponent(tid)+"/unread",{method:"POST"}):
      a==="purge"?api("/thread/"+encodeURIComponent(tid),{method:"DELETE"}):
      api("/thread/"+encodeURIComponent(tid)+"/folder",{method:"POST",body:JSON.stringify({folder:a})});
    req.then(function(r){if(!r.ok)throw 0;toast({archive:"Перенесено в архив",inbox:"Перенесено во входящие",trash:"Перенесено в корзину",unread:"Помечено непрочитанным",purge:"Удалено навсегда"}[a],{icon:"check"});
      emptyPane();el("app").classList.remove("reading");S.tid=null;S.offset=0;loadBoxes();loadList();})
      .catch(function(){toast("Не получилось. Попробуйте ещё раз.",{icon:"alert",bad:true});});}

  // ---- compose: modal, autosaved draft, 5 s undo before sending ----
  function plain(m){if(m.text)return m.text;var d=new DOMParser().parseFromString(m.html||"","text/html");return(d.body.innerText||d.body.textContent||"").trim();}
  function stNew(){return{id:uuid(),from:"",to:"",subject:"",text:"",quote:"",files:[]};}
  function stReply(r){return{id:uuid(),from:r.to,to:r.from,subject:/^re:/i.test(r.subject||"")?r.subject:"Re: "+(r.subject||""),text:"",files:[],inbound_id:r.id,
    quote:"\\n\\n"+when(r.at,true)+", "+(r.from_name||r.from)+":\\n"+plain(r).split("\\n").map(function(l){return "> "+l}).join("\\n")};}
  function stForward(m){var s=m.subject||"";return{id:uuid(),from:m.kind==="in"?m.to:m.from,to:"",subject:/^fwd?:/i.test(s)?s:"Fwd: "+s,text:"",files:[],
    fwd_kind:m.kind,fwd_id:m.id,fwd_names:m.attachments.map(function(a){return a.name}),
    quote:"\\n\\n---------- Пересланное сообщение ----------\\nОт: "+(m.from_name?m.from_name+" <"+m.from+">":m.from)+"\\nДата: "+when(m.at,true)+
      "\\nТема: "+s+"\\nКому: "+m.to+"\\n\\n"+plain(m)};}
  function stDraft(d){return{id:d.id,from:d.from_addr,to:d.to_addr,subject:d.subject,text:d.body,quote:d.quote||"",files:[],saved:true,
    inbound_id:d.inbound_id,fwd_kind:d.fwd_kind,fwd_id:d.fwd_id};}
  function saveDraft(st){return api("/drafts/"+st.id,{method:"PUT",body:JSON.stringify({from:st.from,to:st.to,subject:st.subject,text:st.text,
    quote:st.quote,inbound_id:st.inbound_id,fwd_kind:st.fwd_kind,fwd_id:st.fwd_id})}).then(function(r){if(r.ok)st.saved=true;return r.ok;}).catch(function(){return false;});}
  function afterDrafts(){loadBoxes();if(S.folder==="drafts")loadList(true);}
  function compose(st){var box=el("modal"),dirty=!!st.saved,timer=null,title=st.inbound_id?"Ответ":st.fwd_id?"Пересылка":"Новое письмо";
    var from=st.from.toLowerCase(),fromV=(S.senders.filter(function(s){return s.toLowerCase()===from})[0])||S.senders[0]||"";
    var fwdNote=st.fwd_id&&(!st.fwd_names||st.fwd_names.length)?'<div class="note">'+ic("clip")+(st.fwd_names&&st.fwd_names.length?"Будут приложены: "+esc(st.fwd_names.join(", ")):"Вложения исходного письма будут приложены")+'</div>':"";
    box.classList.remove("hidden");
    box.innerHTML='<div class="compose" role="dialog" aria-modal="true" aria-label="'+title+'">'+
      '<div class="chdr"><h2>'+title+'</h2><button class="btn icon ghost" id="cClose" aria-label="Закрыть" title="Закрыть — письмо останется в черновиках">'+ic("x")+'</button></div>'+
      '<div class="crow"><span>От</span><div id="cFrom"></div></div>'+
      '<label class="crow"><span>Кому</span><input class="cin" id="cTo" type="email" value="'+esc(st.to)+'" placeholder="name@example.com"></label>'+
      '<label class="crow"><span>Тема</span><input class="cin" id="cSubj" value="'+esc(st.subject)+'"></label>'+
      '<textarea class="cbody-in" id="cBody" placeholder="Текст письма" aria-label="Текст письма"></textarea>'+
      '<div class="cextra">'+fwdNote+(st.quote?'<button class="qbtn" id="cQBtn">Показать цитату</button><pre class="quoted hidden" id="cQuote">'+esc(st.quote.replace(/^\\n+/,""))+'</pre>':"")+'</div>'+
      '<div class="err" id="cErr" role="alert"></div>'+
      '<div class="cbar"><button class="btn primary" id="sendBtn">'+ic("send")+'Отправить</button>'+
      '<label class="btn ghost" title="Прикрепить файлы">'+ic("clip")+'Файлы<input type="file" id="cFiles" multiple hidden></label>'+
      '<span class="note" id="cFileList"></span><span class="sp"></span><span class="note" id="cSaved"></span>'+
      '<button class="btn icon ghost danger" id="cDiscard" aria-label="Удалить черновик" title="Удалить черновик">'+ic("trash")+'</button></div></div>';
    var fromDD=dropdown(el("cFrom"),{value:fromV,items:S.senders.map(function(s){return{v:s,label:s}})});
    el("cBody").value=st.text;
    function files(){el("cFileList").textContent=st.files.map(function(f){return f.name+" ("+size(f.size)+")"}).join(", ");}
    files();
    function read(){st.from=fromDD.get();st.to=el("cTo").value.trim();st.subject=el("cSubj").value.trim();st.text=el("cBody").value;}
    function hasContent(){return st.text.trim()||(dirty&&(st.to||st.subject));}
    function autosave(){dirty=true;clearTimeout(timer);el("cSaved").textContent="";timer=setTimeout(function(){read();
      if(hasContent())saveDraft(st).then(function(ok){if(el("cSaved"))el("cSaved").textContent=ok?"Черновик сохранён":"";});},1200);}
    function shut(){clearTimeout(timer);box.classList.add("hidden");box.innerHTML="";document.removeEventListener("keydown",onKey);}
    function close(){read();shut();if(dirty&&hasContent())saveDraft(st).then(function(ok){
      toast(ok?"Сохранено в черновиках":"Черновик не сохранён",ok?{icon:"check"}:{icon:"alert",bad:true});afterDrafts();});}
    function onKey(e){if(e.key==="Escape"&&!e.defaultPrevented)close();}
    document.addEventListener("keydown",onKey);
    ["cTo","cSubj","cBody"].forEach(function(id){el(id).addEventListener("input",autosave);});
    el("cFrom").addEventListener("click",function(e){if(e.target.closest(".dd-opt"))autosave();});
    if(st.quote)el("cQBtn").addEventListener("click",function(){var open=el("cQuote").classList.toggle("hidden")===false;
      this.textContent=open?"Скрыть цитату":"Показать цитату";});
    el("cFiles").addEventListener("change",function(){st.files=st.files.concat(Array.prototype.slice.call(this.files));this.value="";files();});
    el("cClose").addEventListener("click",close);
    el("cDiscard").addEventListener("click",function(){shut();if(st.saved)api("/drafts/"+st.id,{method:"DELETE"}).then(afterDrafts).catch(function(){});
      toast("Черновик удалён",{icon:"trash"});});
    el("sendBtn").addEventListener("click",function(){read();
      if(!/^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$/.test(st.to)){el("cErr").textContent="Укажите адрес получателя, например name@example.com.";el("cTo").focus();return;}
      if(!st.subject){el("cErr").textContent="Добавьте тему письма.";el("cSubj").focus();return;}
      if(!st.text.trim()){el("cErr").textContent="Напишите текст письма.";el("cBody").focus();return;}
      if(st.files.reduce(function(a,f){return a+f.size},0)>10485760){el("cErr").textContent="Вложения больше 10 МБ. Уберите часть файлов.";return;}
      shut();saveDraft(st).then(afterDrafts);queueSend(st);});
    (st.to?el("cBody"):el("cTo")).focus();}
  var pending=0;
  window.addEventListener("beforeunload",function(e){if(pending){e.preventDefault();e.returnValue="";}});
  function queueSend(st){pending++;var left=5,iv;
    function tick(){toast("Отправка через "+left+" с",{icon:"send",keep:true,action:"Вернуть в черновик",onAction:undo});}
    function undo(){clearInterval(iv);pending--;hideToast();compose(st);}
    iv=setInterval(function(){left--;if(left>0)tick();else{clearInterval(iv);go();}},1000);tick();
    function go(){toast("Отправляется…",{icon:"loader",keep:true});
      Promise.all(st.files.map(readFile)).then(function(list){return api("/compose",{method:"POST",body:JSON.stringify({from:st.from,to:st.to,subject:st.subject,
        text:st.text.replace(/\\s+$/,"")+(st.quote||""),inbound_id:st.inbound_id,draft_id:st.id,attachments:list,
        forward:st.fwd_id?{kind:st.fwd_kind,id:st.fwd_id}:undefined})});})
      .then(function(res){return res.json().then(function(d){return{ok:res.ok,d:d}})})
      .then(function(res){pending--;var er=res.d.error||{};if(!res.ok)throw new Error(er.code==="provider_error"?"почтовый сервис не принял письмо":er.message||"ошибка сервера");
        toast("Отправлено",{icon:"check"});loadBoxes();S.offset=0;loadList(true);reloadThread();},
        function(e){pending--;throw e;})
      .catch(function(e){afterDrafts();
        toast("Не отправлено: "+(e&&e.message==="Failed to fetch"?"нет связи с сервером":(e&&e.message)||"ошибка")+". Письмо в черновиках.",
          {icon:"alert",bad:true,sticky:true,action:"Открыть",onAction:function(){hideToast();compose(st);}});});}}
  function readFile(f){return new Promise(function(ok,fail){var fr=new FileReader();
    fr.onload=function(){ok({filename:f.name,content:String(fr.result).split(",")[1]||""});};fr.onerror=fail;fr.readAsDataURL(f);});}

  fetch("/dashboard/api/me",{credentials:"same-origin"}).then(function(r){if(r.ok)showApp();else showLogin();}).catch(showLogin);
})();
</script>
</body>
</html>`;
