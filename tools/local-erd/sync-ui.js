import {
    canonicalRepository,
    summarizeSchemaDifference,
} from './schema-diff.js';
import { createRepositorySwitcher } from './repository-switcher.js';
import {
    applyLayoutPackage,
    checkLayoutCompatibility,
    exportLayoutPackage,
    hasLayoutBackup,
    layoutTableCatalog,
    parseLayoutPackage,
    previewLayoutPackage,
    restoreLayoutBackup,
    snapshotLayoutSource,
} from './layout-transfer.js';
import { isPartialLayoutPackage } from './layout-package.js';
import { createLayoutTablePicker } from './layout-table-picker.js';

const icon =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.55-2.55L20 7M4 17l2.35 2.55A7 7 0 0 0 17.9 17"/></svg>';
const arrow =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const infoIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';
const style = document.createElement('style');
style.textContent = `#erd-sync{position:fixed;top:58px;right:22px;z-index:100000;font:13px system-ui;color:#e2e8f0}#erd-sync button{display:flex;align-items:center;justify-content:center;gap:8px;background:#172131;color:#e2e8f0;border:1px solid #364152;border-radius:9px;padding:9px 15px;font:inherit;cursor:pointer;box-shadow:0 3px 12px #0003}#erd-sync button:hover{background:#263449;border-color:#818cf8}#erd-sync button:focus-visible{outline:2px solid #a5b4fc;outline-offset:3px}#erd-sync button:disabled{cursor:wait;opacity:.8}#erd-sync.busy svg{animation:erd-spin 1s linear infinite}@keyframes erd-spin{to{transform:rotate(360deg)}}#erd-sync-panel{display:none;position:fixed;inset:0;z-index:100001;background:#080f1bc9;place-items:center;font:14px system-ui;color:#e2e8f0}#erd-sync-panel.visible{display:grid}#erd-sync-panel section{width:min(370px,calc(100vw - 64px));padding:28px;background:#111c2e;border:1px solid #334155;border-radius:16px;box-shadow:0 24px 80px #0008}#erd-sync-panel h2{margin:0 0 12px;font-size:18px}#erd-sync-panel p{line-height:1.6;color:#aebbd0;margin:12px 0}#erd-sync-panel progress{width:100%;height:8px;accent-color:#818cf8}#erd-sync-panel button{margin-top:10px;border:1px solid #475569;background:#25324a;color:white;padding:8px 14px;border-radius:7px;cursor:pointer}@media(prefers-reduced-motion:reduce){#erd-sync.busy svg{animation:none}}`;
document.head.append(style);
style.textContent +=
    '#erd-sync{display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 30px)}#erd-sync select{max-width:230px;min-width:120px;background:#172131;color:#e2e8f0;border:1px solid #364152;border-radius:9px;padding:9px;font:inherit}#erd-sync-source{max-width:130px!important}#erd-open{display:none}#erd-layout-action{background:#312e81!important;border-color:#6366f1!important;color:#eef2ff!important}#erd-info{position:relative;display:flex}#erd-info-button{width:38px;height:38px;padding:0!important;border-radius:999px!important;color:#a5b4fc!important}#erd-info-tooltip{position:absolute;top:calc(100% + 10px);right:0;width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:14px 15px;border:1px solid #475569;border-radius:12px;background:#0b1425f5;box-shadow:0 18px 48px #0009;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .15s ease,transform .15s ease,visibility .15s;pointer-events:none;backdrop-filter:blur(12px)}#erd-info:hover #erd-info-tooltip,#erd-info:focus-within #erd-info-tooltip,#erd-info.open #erd-info-tooltip{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto}#erd-info-tooltip strong{display:block;margin-bottom:8px;color:#f8fafc;font-size:13px}#erd-info-tooltip small{display:block;max-width:none;padding:4px 0;font-size:12px;line-height:1.45;text-align:left;overflow-wrap:anywhere}#erd-branch-status{color:#fbbf24}#erd-schema-status{color:#86efac}#erd-input-status{color:#a5b4fc}#erd-worktree-status{color:#c4b5fd}#erd-branch-diff{position:fixed;top:62px;left:50%;z-index:99999;transform:translateX(-50%);max-width:min(560px,calc(100vw - 420px));padding:8px 14px;border:1px solid #39ff88;border-radius:999px;background:#07140fe8;color:#dfffea;box-shadow:0 0 18px #39ff8848;font:600 12px system-ui;text-align:center;backdrop-filter:blur(8px)}#erd-branch-diff.muted{border-color:#64748b;color:#cbd5e1;box-shadow:none;background:#111827e8}.local-erd-new-table{outline:4px solid #39ff88!important;outline-offset:5px;box-shadow:0 0 20px #39ff8870!important}.local-erd-new-field{box-shadow:inset 0 0 0 2px #39ff88!important;background:#39ff8824!important}#canvas.local-erd-all-new::after{content:"";position:absolute;inset:52px 22px 22px;z-index:9;border:5px solid #39ff88;border-radius:18px;box-shadow:inset 0 0 24px #39ff8840,0 0 24px #39ff8860;pointer-events:none}@media(max-width:800px){#erd-branch-diff{top:108px;max-width:calc(100vw - 32px)}}';
const toolbar = document.createElement('div');
toolbar.id = 'erd-sync';
const home = location.pathname === '/';
toolbar.innerHTML = `${home ? '' : '<select id="erd-sync-source" aria-label="Sync 기준"><option value="remote">GitHub 원격</option><option value="local">로컬 Git</option></select>'}<select id="erd-branch" aria-label="열거나 동기화할 GitHub 브랜치" disabled><option>브랜치 불러오는 중…</option></select><button id="erd-branch-refresh" type="button" aria-label="브랜치 목록 새로고침" title="선택한 저장소의 브랜치 목록 새로고침" disabled>${icon}</button><button id="erd-sync-action" type="button" title="GitHub 최신 스키마로 갱신" aria-label="GitHub 최신 상태로 Sync" disabled>${icon}<span>GitHub 최신 상태로 Sync</span></button>${home ? `<button id="erd-open" type="button" disabled><span>이 브랜치로 ERD 열기</span>${arrow}</button>` : '<button id="erd-layout-action" type="button" disabled>작업 데이터 공유</button>'}<div id="erd-info"><button id="erd-info-button" type="button" aria-label="현재 Sync 정보" aria-describedby="erd-info-tooltip" aria-expanded="false">${infoIcon}</button><div id="erd-info-tooltip" role="tooltip"><strong>${home ? '현재 선택 정보' : '현재 ERD 정보'}</strong><small id="erd-worktree-status" role="status" hidden></small><small id="erd-branch-status" role="status"></small><small id="erd-schema-status" role="status"></small><small id="erd-input-status" role="status"></small></div></div>`;
const panel = document.createElement('div');
panel.id = 'erd-sync-panel';
panel.innerHTML =
    '<section role="dialog" aria-modal="true" aria-labelledby="erd-sync-title"><h2 id="erd-sync-title">GitHub 스키마 동기화</h2><p role="status" aria-live="polite"></p><progress max="100" value="0" aria-label="동기화 진행률"></progress><p><small>선택한 브랜치만 갱신합니다.<br>브랜치별 배치·색상·메모를 유지합니다.</small></p><button type="button" hidden>닫기</button></section>';
(document.querySelector('#sync-controls') ?? document.body).append(toolbar);
if (!home) {
    const root = document.querySelector('#root');
    let observedHeader;
    const resizeObserver =
        typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(() => positionBelowHeader());
    function positionBelowHeader() {
        const header = root?.querySelector('nav');
        if (!header) return false;
        if (header !== observedHeader) {
            if (observedHeader) resizeObserver?.unobserve(observedHeader);
            resizeObserver?.observe(header);
            observedHeader = header;
        }
        toolbar.style.top = `${Math.ceil(header.getBoundingClientRect().bottom) + 10}px`;
        return true;
    }
    positionBelowHeader();
    if (root) {
        const observer = new MutationObserver(() => {
            if (root.querySelector('nav') !== observedHeader)
                positionBelowHeader();
        });
        observer.observe(root, { childList: true, subtree: true });
    }
    window.addEventListener('resize', positionBelowHeader);
}
document.body.append(panel);
const layoutPanel = document.createElement('div');
layoutPanel.id = 'erd-layout-panel';
layoutPanel.innerHTML = `<section role="dialog" aria-labelledby="erd-layout-title" class="erd-layout-dialog" tabindex="-1">
  <header class="erd-layout-header">
    <div><div class="erd-layout-heading-line"><h2 id="erd-layout-title">배치 공유</h2><div id="erd-layout-branch"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4" cy="3" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="4" cy="13" r="2"/><path d="M4 5v6m0-2c5 0 8-1 8-3"/></svg><span></span></div></div><div id="erd-layout-source"></div></div>
    <button id="erd-layout-close" type="button" aria-label="공유 창 닫기"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
  </header>
  <div class="erd-layout-tabs" role="tablist" aria-label="공유 작업">
    <button type="button" id="erd-layout-tab-export" role="tab" aria-selected="true" aria-controls="erd-layout-export-panel" data-layout-tab="export">내보내기</button>
    <button type="button" id="erd-layout-tab-import" role="tab" aria-selected="false" aria-controls="erd-layout-import-panel" tabindex="-1" data-layout-tab="import">가져오기</button>
  </div>
  <div class="erd-layout-body">
    <div id="erd-layout-export-panel" role="tabpanel" aria-labelledby="erd-layout-tab-export">
      <div class="erd-layout-scope" role="group" aria-label="내보낼 범위">
        <label><input type="radio" name="erd-layout-scope" value="selected" checked><span>테이블 선택</span></label>
        <label><input type="radio" name="erd-layout-scope" value="all"><span>전체 작업 데이터</span></label>
      </div>
      <div id="erd-layout-picker"></div>
      <div id="erd-layout-full-description" hidden><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="6" width="13" height="27" rx="3"/><rect x="23" y="13" width="12" height="20" rx="3"/><path d="M8 13h7M8 19h7M8 25h7M26 20h6M26 26h6"/></svg><h3>레포의 작업 데이터를 한 번에</h3><p>모든 테이블의 배치·색상과 Area·메모를 포함합니다.<br>테이블 구조와 컬럼·관계는 포함하지 않습니다.</p></div>
    </div>
    <div id="erd-layout-import-panel" role="tabpanel" aria-labelledby="erd-layout-tab-import" hidden>
      <input id="erd-layout-file" type="file" accept=".json,application/json" hidden>
      <button id="erd-layout-import" type="button" class="erd-layout-file-zone"><svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M14 18V4m-5 5 5-5 5 5M5 18v5h18v-5"/></svg><strong>JSON 파일 선택</strong><span>공유받은 배치 파일을 선택하세요 · 최대 5 MB</span></button>
      <div id="erd-layout-import-preview" hidden><div class="erd-layout-file-name"><strong id="erd-layout-file-name"></strong><span id="erd-layout-import-kind"></span></div><dl class="erd-layout-import-stats"><div><dt>파일의 테이블</dt><dd id="erd-layout-count-total">0</dd></div><div><dt>적용 가능</dt><dd id="erd-layout-count-matched">0</dd></div><div><dt>건너뜀</dt><dd id="erd-layout-count-skipped">0</dd></div></dl><p id="erd-layout-import-help"></p></div>
    </div>
    <div class="erd-layout-status-line"><p id="erd-layout-status" role="status" aria-live="polite" hidden></p><button id="erd-layout-retry" type="button" hidden>다시 불러오기</button></div>
  </div>
  <footer class="erd-layout-footer">
    <div id="erd-layout-export-footer"><div><strong id="erd-layout-export-summary">테이블을 선택하세요</strong><button id="erd-layout-focus" type="button" class="text-button" disabled>선택한 테이블 보기 ↗</button><small id="erd-layout-export-help">배치만 공유하며 컬럼·관계는 포함하지 않습니다.</small></div><button id="erd-layout-export-selected" class="primary" type="button" disabled>선택 후 내보내기</button><button id="erd-layout-export" class="primary" type="button" hidden>전체 배치 내보내기</button></div>
    <div id="erd-layout-import-footer" hidden><button id="erd-layout-restore" class="text-button" type="button" hidden>직전 가져오기 되돌리기</button><button id="erd-layout-apply" class="primary" type="button" hidden>배치 적용</button></div>
  </footer>
</section>
`;
document.body.append(layoutPanel);
style.textContent += `#erd-layout-panel{display:none;position:fixed;top:58px;right:18px;bottom:18px;z-index:100003;pointer-events:none;box-sizing:border-box;color:#e8e9f0;font:13px/1.5 system-ui;--layout-muted:#9399aa;--layout-line:#303442;--layout-accent:#a69aff;color-scheme:dark}
#erd-layout-panel.visible{display:block}
#erd-layout-panel [hidden]{display:none!important}
#erd-layout-panel .erd-layout-dialog{display:flex;flex-direction:column;pointer-events:auto;width:min(460px,calc(100vw - 36px));height:100%;max-height:100%;overflow:hidden;box-sizing:border-box;background:#171a23;border:1px solid #363b4d;border-radius:18px;box-shadow:0 24px 90px #0009}
#erd-layout-panel button,#erd-layout-panel input,#erd-layout-panel select{font:inherit}
#erd-layout-panel button{border:1px solid transparent;background:none;color:inherit;cursor:pointer;border-radius:7px;transition:background .12s,border-color .12s}
#erd-layout-panel button:hover:not(:disabled){background:#ffffff0a}
#erd-layout-panel button:disabled{opacity:.4;cursor:not-allowed}
#erd-layout-panel :focus-visible{outline:2px solid var(--layout-accent);outline-offset:2px}
#erd-layout-panel input[type=checkbox]{width:15px;height:15px;flex:none;margin:0;accent-color:var(--layout-accent);cursor:pointer}
.erd-layout-header{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 24px 10px;gap:16px}.erd-layout-header>div{min-width:0}.erd-layout-heading-line{display:flex;align-items:center;gap:12px;min-width:0}
#erd-layout-panel h2{font-size:20px;letter-spacing:-.5px;line-height:1.3;margin:0;font-weight:650;white-space:nowrap}
.erd-layout-header p{margin:7px 0 0;color:var(--layout-muted);font-size:12px}
#erd-layout-close{width:30px;height:30px;display:grid;place-items:center;flex:none;color:var(--layout-muted)!important}
#erd-layout-close svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.5}
#erd-layout-source{margin-top:7px;color:#929bad;font-size:11px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
#erd-layout-branch{display:flex;align-items:center;gap:5px;min-width:0;max-width:240px;padding:3px 8px;border:1px solid #a69aff30;background:#a69aff10;color:#c4baff;border-radius:6px;font-size:11px}
#erd-layout-branch svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.3;flex:none}
#erd-layout-branch span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erd-layout-tabs{display:flex;gap:24px;margin:0 24px;border-bottom:1px solid var(--layout-line)}
#erd-layout-panel .erd-layout-tabs button{padding:10px 1px;border-radius:0;color:var(--layout-muted);border-bottom:2px solid transparent;margin-bottom:-1px}
#erd-layout-panel .erd-layout-tabs button[aria-selected=true]{color:#e4dfff;border-bottom-color:var(--layout-accent);font-weight:600}
.erd-layout-body{display:flex;flex-direction:column;padding:14px 24px;overflow:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#414655 transparent}
#erd-layout-export-panel:not([hidden]){display:flex;flex-direction:column;flex:1;min-height:0}
#erd-layout-picker{display:flex;flex-direction:column;flex:1;min-height:300px}
.erd-layout-scope{display:flex;flex-shrink:0;width:fit-content;border:1px solid var(--layout-line);border-radius:8px;padding:3px;margin-bottom:12px;background:#11141c;gap:3px}
.erd-layout-scope label{position:relative;cursor:pointer;white-space:nowrap}
.erd-layout-scope input{position:absolute;opacity:0;width:1px;height:1px}
.erd-layout-scope span{display:block;padding:6px 12px;border-radius:5px;color:var(--layout-muted);font-size:12px}
.erd-layout-scope label:has(input:checked) span{background:#303244;color:#eeeaff;box-shadow:0 1px 3px #0004}
.erd-layout-scope label:has(input:focus-visible){outline:2px solid var(--layout-accent);outline-offset:2px;border-radius:5px}
.erd-layout-selection{flex:none;border:1px solid #a69aff2b;background:#a69aff09;border-radius:9px;padding:10px 11px;margin-bottom:12px}
.erd-layout-selection-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:12px}
.erd-layout-selection-heading strong{font-weight:600;color:#e0d9ff;display:flex;align-items:center;gap:6px}
[data-basket-count]{background:#b4a2ff24;color:#d9ceff;padding:0 5px;border-radius:4px;font-size:11px;font-variant-numeric:tabular-nums}
#erd-layout-panel [data-basket-empty]{font-size:11px;color:#8e96aa;margin:0;line-height:1.5}
.erd-layout-selection-chips{display:flex;flex-wrap:wrap;align-content:flex-start;gap:6px;max-height:90px;overflow:auto;scrollbar-width:thin;scrollbar-color:#514a70 transparent;padding:2px}
.erd-layout-selection-chip{display:flex;align-items:center;gap:2px;max-width:100%;min-width:0;border:1px solid #a69aff45;border-radius:6px;background:#a69aff13;color:#dfd7ff;font:11px ui-monospace,SFMono-Regular,Consolas,monospace}
#erd-layout-panel .erd-layout-chip-name{padding:4px 5px 4px 7px;color:inherit;font:inherit;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left}
#erd-layout-panel [data-remove-table]{flex:none;display:grid;place-items:center;width:23px;height:24px;padding:0;font:16px/1 system-ui;color:#bcb0e3;border-left:1px solid #a69aff1a;border-radius:0 5px 5px 0}
#erd-layout-panel [data-remove-table]:hover{background:#a69aff2b;color:#fff}
.erd-layout-list-hint{color:#717b91;font-size:10px}
.erd-layout-search{display:flex;flex-shrink:0;gap:9px;align-items:center;padding:0 11px;height:38px;border:1px solid #3a4050;border-radius:8px;background:#11141c}
.erd-layout-search:focus-within{border-color:var(--layout-accent);box-shadow:0 0 0 2px #a69aff15}
.erd-layout-search svg{width:16px;height:16px;stroke:#8c94a7;stroke-width:1.5;flex:none}
#erd-layout-panel .erd-layout-search input{width:100%;min-width:0;background:none;border:0;color:#f1f2f5;padding:8px 0;outline:none}
.erd-layout-search input::placeholder{color:#757d91}
.erd-layout-list-filters{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0}
#erd-layout-panel [data-current-count]{color:#a2aabc;font-size:12px}
#erd-layout-panel [data-selected-only]{display:flex;align-items:center;gap:6px;padding:5px 8px;color:var(--layout-muted);font-size:12px}
#erd-layout-panel [data-selected-only] span{font-size:11px;min-width:16px;text-align:center;border-radius:4px;background:#ffffff0b;color:#c9cddd;padding:0 3px}
#erd-layout-panel [data-selected-only][aria-pressed=true]{background:#a69aff17;color:#c9beff}
.erd-layout-list-toolbar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--layout-line);border-bottom:0;border-radius:8px 8px 0 0;background:#1d212c;font-size:12px;color:#adb4c5}
.erd-layout-list-toolbar label{display:flex;align-items:center;gap:10px;cursor:pointer}
#erd-layout-panel [data-clear]{font-size:11px;color:#b9b0ed;padding:0 4px}
.erd-layout-table-list{flex:1;min-height:80px;overflow:auto;background:#131620;border:1px solid var(--layout-line);border-radius:0 0 8px 8px;scrollbar-width:thin;scrollbar-color:#414655 transparent;overscroll-behavior:contain}
.erd-layout-table-list.loading{display:grid;place-items:center;color:var(--layout-muted)}
.erd-layout-table-list::-webkit-scrollbar,.erd-layout-body::-webkit-scrollbar{width:7px}
.erd-layout-table-list::-webkit-scrollbar-thumb,.erd-layout-body::-webkit-scrollbar-thumb{background:#414655;border-radius:8px;border:2px solid #131620}
.erd-layout-schema-heading{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1c202b;border-bottom:1px solid #272d3b;color:#c5cad9;font-size:11px;font-weight:600;cursor:pointer}
#erd-layout-panel .erd-layout-schema-heading button{display:flex;align-items:center;gap:8px;flex:1;min-width:0;padding:0;color:inherit;text-align:left;font:inherit}
.erd-layout-schema-heading button>span:first-child{font-size:19px;line-height:14px;transition:transform .12s}
.erd-layout-schema-heading button[aria-expanded=true]>span:first-child{transform:rotate(90deg)}
.erd-layout-schema-heading button>span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erd-layout-schema-heading small{color:#7e879a;font-weight:400;margin-left:2px}
.erd-layout-table-row{display:flex;align-items:center;gap:10px;height:35px;padding:0 12px 0 30px;cursor:pointer;border-bottom:1px solid #ffffff04;transition:background .12s}
.erd-layout-table-row:hover{background:#ffffff05}
.erd-layout-table-row:has(input:checked){background:#a69aff0e;color:#e1dbff}
.erd-layout-table-row span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:13px ui-monospace,SFMono-Regular,Consolas,monospace;min-width:0}
#erd-layout-panel .erd-layout-pick-count{margin:8px 0 0;min-height:17px;color:#7e879a;font-size:11px}
.erd-layout-empty-list{display:grid;place-items:center;height:100%;padding:20px;box-sizing:border-box;color:var(--layout-muted);text-align:center}
#erd-layout-full-description{display:grid;justify-items:center;text-align:center;padding:40px 12px 50px;color:var(--layout-muted);min-height:220px;box-sizing:border-box}
#erd-layout-full-description svg{width:44px;height:44px;stroke:#aca1f3;stroke-width:1.3;margin-bottom:14px}
#erd-layout-full-description h3{margin:0 0 7px;font-size:15px;color:#e5e6ef;font-weight:600}
#erd-layout-full-description p{margin:0;line-height:1.8;font-size:12px}
.erd-layout-footer{flex:none;padding:12px 24px;border-top:1px solid var(--layout-line);background:#1b1e28}
#erd-layout-export-footer,#erd-layout-import-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;min-height:38px}
#erd-layout-export-footer{display:grid;grid-template-columns:1fr}
#erd-layout-export-footer>.primary{width:100%}
#erd-layout-export-footer strong{display:inline-block;font-size:12px;font-weight:600;color:#d4d8e4}
#erd-layout-focus{float:right;padding:0!important;font-size:11px!important;color:#b9adff!important}
#erd-layout-export-footer small{display:block;font-size:11px;color:#858da0;margin-top:3px}
#erd-layout-panel button.primary{padding:10px 16px;background:#a397f5;border:1px solid #b5aafa;color:#171225;white-space:nowrap;font-weight:650;box-shadow:0 1px 2px #0003}
#erd-layout-panel button.primary:hover:not(:disabled){background:#b4a9ff}
#erd-layout-panel button.primary:disabled{background:#343343;border-color:#464254;color:#a5a0b7;opacity:1;box-shadow:none}
#erd-layout-panel .text-button{padding:8px 0;color:#979fb2;font-size:12px}
#erd-layout-panel .erd-layout-file-zone{width:100%;display:flex;flex-direction:column;align-items:center;gap:9px;padding:32px 20px;border:1px dashed #4b5264;border-radius:10px;background:#131620}
.erd-layout-file-zone svg{height:28px;width:28px;stroke:#b2a6fc;stroke-width:1.4;margin-bottom:5px}
.erd-layout-file-zone strong{font-size:13px;font-weight:600}
.erd-layout-file-zone span{font-size:11px;color:var(--layout-muted)}
.erd-layout-file-name{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:18px 0 10px;font-size:12px}
.erd-layout-file-name strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.erd-layout-file-name span{font-size:11px;color:var(--layout-muted);white-space:nowrap}
.erd-layout-import-stats{display:grid;grid-template-columns:repeat(3,1fr);margin:0;padding:14px 0;border-block:1px solid var(--layout-line)}
.erd-layout-import-stats div{text-align:center;border-right:1px solid var(--layout-line)}
.erd-layout-import-stats div:last-child{border:0}
.erd-layout-import-stats dt{font-size:11px;color:var(--layout-muted)}
.erd-layout-import-stats dd{font-size:23px;margin:4px 0 0;font-variant-numeric:tabular-nums}
#erd-layout-count-matched{color:#b3dfc8}
#erd-layout-import-help{font-size:12px;color:#a3aabb;line-height:1.8;margin:12px 0 0}
#erd-layout-panel #erd-layout-status{font-size:12px;margin:12px 0 0;color:#b2b9ca}
.erd-layout-status-line{display:flex;align-items:baseline;gap:12px}#erd-layout-panel #erd-layout-retry{white-space:nowrap;padding:4px 8px;color:var(--layout-accent);font-size:12px}
#erd-layout-status.error{color:#fca5b0!important}
#erd-layout-status.success{color:#a4dbc0!important}
@media(max-width:520px){.erd-layout-header{padding:18px 18px 12px}.erd-layout-tabs{margin-inline:18px}#erd-layout-source{max-width:42vw}.erd-layout-body{padding:14px 18px}.erd-layout-footer{flex:none;padding:14px 18px}#erd-layout-export-footer{align-items:flex-start;flex-direction:column;gap:12px}#erd-layout-export-footer button{width:100%}.erd-layout-table-row{padding-left:22px}.erd-layout-list-filters{gap:4px}.erd-layout-file-name{flex-direction:column;gap:4px}}
`;
style.textContent +=
    '#erd-layout-transition{position:fixed;inset:0;z-index:100004;display:grid;place-items:center;background:#080f1be8;color:#eef2ff;font:14px system-ui;opacity:1;transition:opacity .2s ease;pointer-events:all}#erd-layout-transition[hidden]{display:none}#erd-layout-transition.fade-out{opacity:0}#erd-layout-transition section{display:grid;justify-items:center;gap:14px;min-width:250px;padding:26px 30px;border:1px solid #475569;border-radius:16px;background:#111c2e;box-shadow:0 24px 80px #0009;text-align:center}#erd-layout-transition span{width:34px;height:34px;border:3px solid #818cf855;border-top-color:#a5b4fc;border-radius:50%;animation:erd-layout-spin .8s linear infinite}#erd-layout-transition small{color:#cbd5e1}@keyframes erd-layout-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#erd-layout-transition span{animation:none;border-color:#a5b4fc}}';
const layoutTransition = document.createElement('div');
layoutTransition.id = 'erd-layout-transition';
layoutTransition.hidden = true;
layoutTransition.innerHTML =
    '<section role="status" aria-live="polite"><span aria-hidden="true"></span><strong>ERD 작업 데이터를 적용하는 중…</strong><small>새 배치·색상·Area·메모를 화면에 반영합니다.</small></section>';
document.body.append(layoutTransition);
const diffBadge = document.createElement('div');
diffBadge.id = 'erd-branch-diff';
diffBadge.setAttribute('role', 'status');
diffBadge.hidden = true;
toolbar.append(diffBadge);
style.textContent += `
#erd-branch-diff{position:relative;inset:auto;transform:none;max-width:none;padding:0;border:0;background:none;box-shadow:none;backdrop-filter:none;text-align:left}
#erd-branch-diff[hidden]{display:none}
#erd-branch-diff.muted{background:none;border:0}
#erd-branch-diff button{white-space:nowrap;color:#a7f3c0;border-color:#348456;background:#10241b;box-shadow:none;font-size:12px}
#erd-branch-diff.muted button{color:#cbd5e1;border-color:#475569;background:#172131}
#erd-diff-tooltip{position:absolute;right:0;top:100%;padding-top:8px;width:min(330px,calc(100vw - 44px));visibility:hidden;opacity:0;transition:opacity .15s;z-index:2}
#erd-branch-diff:hover #erd-diff-tooltip,#erd-branch-diff:focus-within #erd-diff-tooltip{visibility:visible;opacity:1}
#erd-branch-diff.dismissed #erd-diff-tooltip{visibility:hidden;opacity:0}
#erd-diff-tooltip section{padding:16px;border:1px solid #375448;border-radius:12px;background:#0d1925;box-shadow:0 16px 40px #0008;color:#e2e8f0;font:12px/1.6 system-ui}
#erd-diff-tooltip strong{display:block;font-size:13px;margin-bottom:8px;color:#bbf7d0}
#erd-diff-tooltip p{margin:6px 0;overflow-wrap:anywhere;color:#aebdd0}
#erd-diff-tooltip .diff-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid #293849;font-variant-numeric:tabular-nums}
@media(prefers-reduced-motion:reduce){#erd-diff-tooltip{transition:none}}
`;
function renderDiffBadge(label, details) {
    diffBadge.replaceChildren();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-describedby', 'erd-diff-tooltip');
    const tooltip = document.createElement('div');
    tooltip.id = 'erd-diff-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    const card = document.createElement('section');
    const heading = document.createElement('strong');
    heading.textContent = '스키마 변경 정보';
    card.append(heading);
    for (const [index, part] of details.split(' · ').entries()) {
        const row = document.createElement('p');
        row.textContent = part;
        if (index > 0) row.className = 'diff-row';
        card.append(row);
    }
    tooltip.append(card);
    diffBadge.append(button, tooltip);
    button.addEventListener('click', () =>
        diffBadge.classList.remove('dismissed')
    );
    button.addEventListener('focus', () =>
        diffBadge.classList.remove('dismissed')
    );
}
diffBadge.addEventListener('mouseenter', () =>
    diffBadge.classList.remove('dismissed')
);
diffBadge.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') diffBadge.classList.add('dismissed');
});
if (home) {
    style.textContent +=
        '#sync-controls #erd-sync{position:static;max-width:none;justify-content:center;margin:18px 0 0}#sync-controls #erd-open{display:flex;order:4;flex-basis:100%;width:100%;margin-top:8px;padding:13px 18px;background:#4f46e5;border-color:#6366f1;color:#fff;font-weight:650;font-size:14px;box-shadow:0 8px 22px #312e8160}#sync-controls #erd-open:hover:not(:disabled){background:#6366f1;border-color:#818cf8}#sync-controls #erd-open svg{flex:none}#sync-controls #erd-info-tooltip{right:0}';
}
const syncButton = toolbar.querySelector('#erd-sync-action'),
    openButton = toolbar.querySelector('#erd-open'),
    label = toolbar.querySelector('span'),
    message = panel.querySelector('[role=status]'),
    progress = panel.querySelector('progress'),
    close = panel.querySelector('button');
const select = toolbar.querySelector('#erd-branch');
const sourceBasis = toolbar.querySelector('#erd-sync-source');
const layoutButton = toolbar.querySelector('#erd-layout-action');
const refresh = toolbar.querySelector('#erd-branch-refresh');
const branchStatus = toolbar.querySelector('#erd-branch-status');
const schemaStatus = toolbar.querySelector('#erd-schema-status');
const inputStatus = toolbar.querySelector('#erd-input-status');
const selectionSummary = document.createElement('small');
const selectionTooltip = toolbar.querySelector('#erd-info-tooltip');
selectionSummary.id = 'erd-selection-summary';
selectionSummary.textContent =
    '로컬 저장소를 선택하면 커밋·원격 반영 상태·스키마 비교 기준을 확인할 수 있습니다.';
style.textContent +=
    '#erd-info-tooltip.remote-help small:not(#erd-selection-summary){display:none}';
if (home)
    toolbar.querySelector('#erd-info-tooltip').classList.add('remote-help');
toolbar
    .querySelector('#erd-info-tooltip')
    .insertBefore(selectionSummary, branchStatus);
const worktreeStatus = toolbar.querySelector('#erd-worktree-status');
const info = toolbar.querySelector('#erd-info');
const infoButton = toolbar.querySelector('#erd-info-button');
const showAllLocal = document.createElement('label');
showAllLocal.hidden = true;
showAllLocal.innerHTML =
    '<input type="checkbox" aria-label="원격과 동일한 로컬 브랜치도 보기" /> 원격과 동일한 브랜치도 보기';
const showAllLocalInput = showAllLocal.querySelector('input');
const checkRemote = document.createElement('button');
checkRemote.type = 'button';
checkRemote.textContent = '원격 반영 확인';
checkRemote.hidden = true;
const branchOptions = document.createElement('details');
branchOptions.id = 'erd-branch-options';
branchOptions.innerHTML = '<summary>원격 비교 옵션</summary><div></div>';
toolbar.insertBefore(branchOptions, info);
branchOptions.querySelector('div').append(showAllLocal, checkRemote);
if (home) document.querySelector('#source-heading')?.append(info);
style.textContent +=
    '#erd-branch-options{flex-basis:100%;order:3;margin-top:8px;text-align:left;color:#94a3b8;font:12px system-ui}#erd-branch-options summary{cursor:pointer;padding:6px 0}#erd-branch-options>div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}#erd-branch-options:not(:has(label:not([hidden]))){display:none}#erd-branch-options button{box-shadow:none;font-size:12px;padding:6px 10px}';
style.textContent +=
    '#erd-sync [hidden]{display:none!important}#erd-sync label{display:flex;align-items:center;gap:5px;margin:0;font:12px system-ui}#erd-sync label input{width:auto;margin:0;accent-color:#818cf8}';
infoButton.onclick = () => {
    const expanded = info.classList.toggle('open');
    infoButton.setAttribute('aria-expanded', String(expanded));
};
window.addEventListener('click', (event) => {
    if (info.contains(event.target)) return;
    info.classList.remove('open');
    infoButton.setAttribute('aria-expanded', 'false');
});
let localId = '',
    currentLocalBranch = '',
    localBranchDetails = [];
let currentLayoutSource;
let pendingLayoutPackage;
const layoutSourceText = layoutPanel.querySelector('#erd-layout-source');
const layoutStatus = layoutPanel.querySelector('#erd-layout-status');
const layoutRetry = layoutPanel.querySelector('#erd-layout-retry');
const layoutFile = layoutPanel.querySelector('#erd-layout-file');
const layoutExport = layoutPanel.querySelector('#erd-layout-export');
const layoutExportSelected = layoutPanel.querySelector(
    '#erd-layout-export-selected'
);
let layoutIsBusy = false;
let layoutLastDiagram;
let layoutPreviousFocus;
let layoutSelectionSignature;
const layoutFocus = layoutPanel.querySelector('#erd-layout-focus');
const layoutPickerRoot = layoutPanel.querySelector('#erd-layout-picker');
const layoutSummary = layoutPanel.querySelector('#erd-layout-export-summary');
const layoutExportHelp = layoutPanel.querySelector('#erd-layout-export-help');
const layoutScopeInputs = [
    ...layoutPanel.querySelectorAll('input[name="erd-layout-scope"]'),
];
const layoutTabs = [...layoutPanel.querySelectorAll('[data-layout-tab]')];
const layoutPreview = layoutPanel.querySelector('#erd-layout-import-preview');

const layoutPicker = createLayoutTablePicker(
    layoutPickerRoot,
    (count, keys) => {
        layoutExportSelected.disabled = layoutIsBusy || count === 0;
        layoutFocus.disabled = layoutIsBusy || count === 0;
        layoutExportSelected.textContent = count
            ? `${count}개 테이블 내보내기`
            : '선택 후 내보내기';
        if (layoutScopeInputs[0].checked)
            layoutSummary.textContent = count
                ? `${count}개 테이블 선택됨`
                : '테이블을 선택하세요';
        const signature = JSON.stringify([...keys].sort());
        if (
            !layoutIsBusy &&
            layoutAcceptCanvasSelection &&
            layoutPanel.classList.contains('visible') &&
            layoutSelectionMode() &&
            signature !== layoutSelectionSignature
        ) {
            layoutSelectionSignature = signature;
            sendLayoutSelection({ keys, active: true });
        }
    },
    { onFocusTable: (key) => sendLayoutSelection({ keys: [key], focus: true }) }
);
const layoutImport = layoutPanel.querySelector('#erd-layout-import');
const layoutApply = layoutPanel.querySelector('#erd-layout-apply');
const layoutRestore = layoutPanel.querySelector('#erd-layout-restore');
const layoutClose = layoutPanel.querySelector('#erd-layout-close');
const currentDiagramId = () =>
    decodeURIComponent(location.pathname.slice('/diagrams/'.length));
const compactLocalPath = (value) => {
    const normalized = value
        .replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
        .replace(/^\/home\/[^/]+(?=\/|$)/, '~');
    if (normalized.length <= 56) return normalized;
    const parts = normalized.split('/').filter(Boolean);
    const last = parts.at(-1);
    if (normalized.startsWith('~/')) return `~/…/${last}`;
    if (normalized.startsWith('/')) return `/${parts[0]}/…/${last}`;
    return `${parts[0]}/…/${last}`;
};
function setLayoutStatus(message, type = '') {
    layoutStatus.hidden = !message;
    layoutStatus.textContent = message;
    layoutStatus.className = type;
}
let worktreeInfoRequest = 0;
async function showWorktree(repositoryId, label) {
    const request = ++worktreeInfoRequest;
    if (!repositoryId) {
        worktreeStatus.hidden = true;
        worktreeStatus.textContent = '';
        worktreeStatus.removeAttribute('title');
        return;
    }
    worktreeStatus.hidden = false;
    worktreeStatus.textContent = `${label} 확인 중…`;
    try {
        const response = await fetch('/api/local/repositories', {
            cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (request !== worktreeInfoRequest) return;
        const repository = payload.repositories.find(
            (entry) => entry.id === repositoryId
        );
        if (!repository) {
            worktreeStatus.textContent = `${label} · 등록 정보 없음 (메인 화면에서 다시 등록하세요)`;
            worktreeStatus.removeAttribute('title');
            return;
        }
        const kind = repository.linkedWorktree
            ? '연결된 worktree'
            : '기본 worktree';
        const related = payload.repositories.filter(
            (entry) =>
                entry.commonDirectory &&
                entry.commonDirectory === repository.commonDirectory
        );
        worktreeStatus.textContent = related.length
            ? `등록된 로컬 경로 · ${related.map((entry) => compactLocalPath(entry.path)).join(' · ')} · 연결된 worktree의 브랜치·커밋을 함께 조회합니다.`
            : `${label} · ${kind} · ${compactLocalPath(repository.path)}`;
        worktreeStatus.title = repository.path;
    } catch {
        if (request !== worktreeInfoRequest) return;
        worktreeStatus.textContent = `${label} 경로를 불러오지 못했습니다.`;
        worktreeStatus.removeAttribute('title');
    }
}
const showCurrentWorktree = (snapshot) =>
    showWorktree(
        snapshot?.source?.kind === 'local' ? snapshot.source.repositoryId : '',
        '현재 ERD worktree'
    );
function layoutBusy(value) {
    for (const control of [...layoutScopeInputs, ...layoutTabs])
        control.disabled = value;
    layoutIsBusy = value;
    layoutPicker.setBusy(value);
    for (const button of [
        layoutExport,
        layoutImport,
        layoutApply,
        layoutRestore,
        layoutClose,
        layoutRetry,
    ])
        button.disabled = value;
}
function showLayoutTransition(message) {
    layoutTransition.querySelector('strong').textContent = message;
    layoutTransition.classList.remove('fade-out');
    layoutTransition.hidden = false;
}
async function hideLayoutTransition() {
    layoutTransition.classList.add('fade-out');
    await new Promise((resolve) => setTimeout(resolve, 200));
    layoutTransition.hidden = true;
    layoutTransition.classList.remove('fade-out');
}
function refreshAppliedDiagram() {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve();
        };
        const timeout = setTimeout(
            () =>
                finish(
                    new Error(
                        '적용한 작업 데이터를 화면에 표시하지 못했습니다. 페이지를 새로고침하세요.'
                    )
                ),
            5000
        );
        window.dispatchEvent(
            new CustomEvent('keeperd-layout-applied', {
                detail: {
                    diagramId: currentDiagramId(),
                    complete: () => finish(),
                    fail: (message) => finish(new Error(message)),
                },
            })
        );
    });
}
async function finishLayoutRefresh(message) {
    showLayoutTransition(message);
    await refreshAppliedDiagram();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    closeLayoutPanel();
    await hideLayoutTransition();
}
function layoutFileName(source, partial) {
    const slug = source.url
        .replace(/^https:\/\/github\.com\//, '')
        .replace(/\.git$/, '')
        .replace(/[^a-z0-9._-]+/gi, '-');
    return `${slug}.${partial ? 'keeperd-tables' : 'keeperd-layout'}.json`;
}
function downloadLayout(layoutPackage) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(layoutPackage, null, 2)], {
            type: 'application/json',
        })
    );
    link.href = url;
    link.download = layoutFileName(
        layoutPackage.repository,
        isPartialLayoutPackage(layoutPackage)
    );
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshLayoutRestore() {
    try {
        layoutRestore.hidden = !(await hasLayoutBackup(currentDiagramId()));
    } catch (error) {
        layoutRestore.hidden = true;
        setLayoutStatus(error.message);
    }
}
let layoutAcceptCanvasSelection = false;
function sendLayoutSelection(detail) {
    window.dispatchEvent(
        new CustomEvent('keeperd-layout-selection', {
            detail: { diagramId: currentDiagramId(), ...detail },
        })
    );
}
function layoutSelectionMode() {
    return (
        layoutPanel.classList.contains('visible') &&
        !layoutPickerRoot.hidden &&
        layoutTabs[0].getAttribute('aria-selected') === 'true'
    );
}
function syncLayoutSelectionMode() {
    if (!layoutAcceptCanvasSelection || layoutIsBusy) return;
    const active = layoutSelectionMode();
    const keys = layoutPicker.selectedKeys();
    layoutSelectionSignature = active
        ? JSON.stringify([...keys].sort())
        : undefined;
    sendLayoutSelection({ keys, active });
}
window.addEventListener('keeperd-canvas-selection', (event) => {
    if (
        !layoutPanel.isConnected ||
        !layoutSelectionMode() ||
        !layoutAcceptCanvasSelection ||
        event.detail?.diagramId !== currentDiagramId() ||
        !Array.isArray(event.detail.keys) ||
        !event.detail.keys.length
    )
        return;
    // Node clicks explicitly toggle membership. Marquee/keyboard snapshots
    // add a group; an empty canvas selection never discards the share basket.
    const previous = layoutPicker.selectedKeys();
    const next = new Set(previous);
    for (const key of event.detail.keys) {
        if (event.detail.toggle === true && next.has(key)) next.delete(key);
        else next.add(key);
    }
    const keys = [...next];
    if (
        JSON.stringify([...keys].sort()) ===
        JSON.stringify([...previous].sort())
    )
        return;
    layoutPicker.setSelectedKeys(keys);
});
layoutFocus.onclick = () =>
    sendLayoutSelection({ keys: layoutPicker.selectedKeys(), focus: true });
function closeLayoutPanel() {
    layoutAcceptCanvasSelection = false;
    layoutSelectionSignature = undefined;
    sendLayoutSelection({ active: false });
    layoutPanel.classList.remove('visible');
    if (layoutPreviousFocus?.isConnected) layoutPreviousFocus.focus();
    else layoutButton?.focus();
}
function switchLayoutTab(mode) {
    for (const tab of layoutTabs) {
        const active = tab.dataset.layoutTab === mode;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
    }
    for (const kind of ['export', 'import']) {
        layoutPanel.querySelector(`#erd-layout-${kind}-panel`).hidden =
            kind !== mode;
        layoutPanel.querySelector(`#erd-layout-${kind}-footer`).hidden =
            kind !== mode;
    }
    setLayoutStatus('');
    syncLayoutSelectionMode();
}
function updateLayoutExportScope() {
    const all = layoutScopeInputs[1].checked;
    layoutPickerRoot.hidden = all;
    layoutFocus.hidden = all;
    layoutPanel.querySelector('#erd-layout-full-description').hidden = !all;
    layoutExport.hidden = !all;
    layoutExportSelected.hidden = all;
    layoutSummary.textContent = all
        ? '레포 전체의 배치·Area·메모'
        : layoutPicker.selectedKeys().length
          ? `${layoutPicker.selectedKeys().length}개 테이블 선택됨`
          : '테이블을 선택하세요';
    layoutExportHelp.textContent = all
        ? '같은 레포의 모든 브랜치에서 사용하는 작업 데이터입니다.'
        : '배치만 공유하며 컬럼·관계는 포함하지 않습니다.';
    setLayoutStatus('');
    syncLayoutSelectionMode();
}
for (const input of layoutScopeInputs)
    input.addEventListener('change', updateLayoutExportScope);
for (const [index, tab] of layoutTabs.entries()) {
    tab.addEventListener('click', () => switchLayoutTab(tab.dataset.layoutTab));
    tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? layoutTabs.length - 1
                  : (index +
                        (event.key === 'ArrowRight' ? 1 : -1) +
                        layoutTabs.length) %
                    layoutTabs.length;
        if (!layoutTabs[next].disabled) {
            switchLayoutTab(layoutTabs[next].dataset.layoutTab);
            layoutTabs[next].focus();
        }
    });
}
layoutPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layoutIsBusy) {
        event.stopPropagation();
        closeLayoutPanel();
    }
});
if (layoutButton) {
    layoutButton.onclick = async () => {
        pendingLayoutPackage = undefined;
        layoutApply.hidden = true;
        layoutFile.value = '';
        layoutSourceText.textContent = currentLayoutSource
            ? currentLayoutSource.repositoryUrl
                  .replace(/^https:\/\/github\.com\//, '')
                  .replace(/\.git\/?$/, '')
            : '현재 ERD의 출처 정보를 확인하지 못했습니다.';
        layoutSourceText.title = currentLayoutSource?.repositoryUrl ?? '';
        const branchBadge = layoutPanel.querySelector('#erd-layout-branch');
        branchBadge.querySelector('span').textContent =
            currentSnapshot?.branch || '브랜치 정보 없음';
        branchBadge.title = `현재 ERD 브랜치: ${currentSnapshot?.branch || '알 수 없음'}`;
        if (!layoutPanel.classList.contains('visible'))
            layoutPreviousFocus = document.activeElement;
        layoutRetry.hidden = true;
        const editorHeader = document.querySelector('#root nav');
        layoutPanel.style.top = `${Math.ceil(editorHeader?.getBoundingClientRect().bottom ?? 48) + 10}px`;
        switchLayoutTab('export');
        layoutScopeInputs[0].checked = true;
        updateLayoutExportScope();
        layoutPreview.hidden = true;
        layoutImport.querySelector('strong').textContent = 'JSON 파일 선택';
        refreshLayoutRestore();
        layoutPanel.classList.add('visible');
        layoutPanel.querySelector('[role=dialog]').focus();
        layoutAcceptCanvasSelection = false;
        layoutSelectionSignature = undefined;
        layoutBusy(true);
        try {
            const diagramId = currentDiagramId();
            const catalog = await layoutTableCatalog(
                diagramId,
                currentLayoutSource
            );
            layoutPicker.load(catalog.tables, {
                currentTableKeys: catalog.currentTableKeys,
                preserveSelection: layoutLastDiagram === diagramId,
            });
            layoutLastDiagram = diagramId;
            // Adopt the existing canvas selection when the panel is opened.
            layoutAcceptCanvasSelection = true;
            sendLayoutSelection({ read: true });
        } catch (error) {
            setLayoutStatus(
                error.name === 'AbortError'
                    ? '테이블 목록을 불러오지 못했습니다. 다시 시도해 주세요.'
                    : error.message,
                'error'
            );
            layoutRetry.hidden = false;
        } finally {
            layoutBusy(false);
        }
    };
    layoutRetry.onclick = () => layoutButton.onclick();
    layoutClose.onclick = closeLayoutPanel;
    layoutExport.onclick = async () => {
        if (!currentLayoutSource) return;
        layoutBusy(true);
        setLayoutStatus('현재 작업 데이터를 읽는 중…');
        try {
            const layoutPackage = await exportLayoutPackage(
                currentDiagramId(),
                currentLayoutSource
            );
            downloadLayout(layoutPackage);
            setLayoutStatus(
                `내보내기 완료 · 테이블 ${layoutPackage.layout.tables.length}개 · Area ${layoutPackage.layout.areas.length}개 · 메모 ${layoutPackage.layout.notes.length}개`,
                'success'
            );
        } catch (error) {
            setLayoutStatus(error.message, 'error');
        } finally {
            layoutBusy(false);
        }
    };
    layoutExportSelected.onclick = async () => {
        if (!currentLayoutSource || !layoutPicker.selectedKeys().length) return;
        layoutBusy(true);
        setLayoutStatus('선택한 테이블 배치를 읽는 중…');
        try {
            const layoutPackage = await exportLayoutPackage(
                currentDiagramId(),
                currentLayoutSource,
                {
                    tableKeys: layoutPicker.selectedKeys(),
                }
            );
            downloadLayout(layoutPackage);
            setLayoutStatus(
                `부분 내보내기 완료 · 테이블 ${layoutPackage.layout.tables.length}개 · 테이블 이름·스키마명과 배치만 포함`,
                'success'
            );
        } catch (error) {
            setLayoutStatus(error.message, 'error');
        } finally {
            layoutBusy(false);
        }
    };
    layoutImport.onclick = () => layoutFile.click();
    layoutFile.onchange = async () => {
        pendingLayoutPackage = undefined;
        layoutApply.hidden = true;
        layoutPreview.hidden = true;
        const file = layoutFile.files?.[0];
        if (!file || !currentLayoutSource) return;
        if (file.size > 5 * 1024 * 1024) {
            setLayoutStatus(
                '작업 데이터 JSON은 5 MB 이하여야 합니다.',
                'error'
            );
            return;
        }
        layoutBusy(true);
        setLayoutStatus('JSON 호환성을 확인하는 중…');
        try {
            const layoutPackage = parseLayoutPackage(await file.text());
            const compatibility = checkLayoutCompatibility(
                layoutPackage,
                currentLayoutSource
            );
            if (!compatibility.compatible)
                throw new Error(
                    `현재 ERD와 레포가 다릅니다. 출처: ${compatibility.repository.url}`
                );
            const preview = await previewLayoutPackage(
                currentDiagramId(),
                currentLayoutSource,
                layoutPackage
            );
            pendingLayoutPackage = layoutPackage;
            layoutApply.hidden = preview.partial && preview.matchedTables === 0;
            layoutApply.textContent = preview.partial
                ? `${preview.matchedTables}개 테이블에 적용`
                : '전체 배치 적용';
            layoutPanel.querySelector('#erd-layout-file-name').textContent =
                file.name ?? '배치 JSON';
            layoutPanel.querySelector('#erd-layout-import-kind').textContent =
                preview.partial ? '선택 테이블 배치' : '전체 작업 데이터';
            layoutPanel.querySelector('#erd-layout-count-total').textContent =
                String(preview.counts.tables);
            layoutPanel.querySelector('#erd-layout-count-matched').textContent =
                String(preview.matchedTables);
            layoutPanel.querySelector('#erd-layout-count-skipped').textContent =
                String(preview.skippedTables);
            layoutPanel.querySelector('#erd-layout-import-help').textContent =
                preview.partial
                    ? '일치하는 테이블의 배치만 적용합니다. 다른 테이블과 Area·메모·기존 Area 소속은 유지합니다. 같은 레포의 다른 브랜치에도 배치가 반영됩니다.'
                    : `테이블 배치와 Area ${preview.counts.areas}개·메모 ${preview.counts.notes}개를 적용합니다. 같은 레포의 모든 브랜치에서 공유합니다.`;
            layoutPreview.hidden = false;
            layoutImport.querySelector('strong').textContent =
                '다른 JSON 파일 선택';
            setLayoutStatus(
                preview.partial && !preview.matchedTables
                    ? '현재 ERD에 적용할 테이블이 없습니다. 다른 파일이나 ERD를 선택하세요.'
                    : ''
            );
        } catch (error) {
            setLayoutStatus(
                error instanceof SyntaxError
                    ? 'JSON 파일을 읽을 수 없습니다.'
                    : error.message,
                'error'
            );
        } finally {
            layoutBusy(false);
        }
    };
    layoutApply.onclick = async () => {
        if (!pendingLayoutPackage || !currentLayoutSource) return;
        layoutBusy(true);
        setLayoutStatus('현재 작업 데이터를 백업하고 적용하는 중…');
        try {
            const result = await applyLayoutPackage(
                currentDiagramId(),
                currentLayoutSource,
                pendingLayoutPackage
            );
            setLayoutStatus(
                isPartialLayoutPackage(pendingLayoutPackage)
                    ? `부분 적용 완료 · 테이블 ${result.matchedTables}개 · 건너뜀 ${result.skippedTables}개 · 나머지 작업 데이터 유지`
                    : `적용 완료 · 테이블 ${result.matchedTables}개 · Area ${result.areas}개 · 메모 ${result.notes}개`,
                'success'
            );
            await finishLayoutRefresh('새 ERD 작업 데이터를 표시하는 중…');
            layoutBusy(false);
        } catch (error) {
            await hideLayoutTransition();
            setLayoutStatus(error.message, 'error');
            layoutBusy(false);
        }
    };
    layoutRestore.onclick = async () => {
        if (!currentLayoutSource) return;
        layoutBusy(true);
        setLayoutStatus('직전 작업 데이터를 복원하는 중…');
        try {
            await restoreLayoutBackup(currentDiagramId(), currentLayoutSource);
            setLayoutStatus('직전 작업 데이터로 복원했습니다.', 'success');
            await finishLayoutRefresh('직전 ERD 작업 데이터를 표시하는 중…');
            layoutBusy(false);
        } catch (error) {
            await hideLayoutTransition();
            setLayoutStatus(error.message, 'error');
            layoutBusy(false);
        }
    };
}
function updateSyncAction() {
    if (active) return;
    const text = localId ? '로컬 커밋으로 Sync' : 'GitHub 최신 상태로 Sync';
    label.textContent = text;
    syncButton.title = localId
        ? '선택한 로컬 브랜치 커밋의 스키마로 갱신'
        : '선택한 GitHub 브랜치의 최신 스키마로 갱신';
    syncButton.setAttribute('aria-label', text);
    if (sourceBasis) sourceBasis.value = localId ? 'local' : 'remote';
}
const remoteLabel = (branch) =>
    branch.remoteStatus === 'unpublished'
        ? '원격에 없음'
        : branch.remoteStatus === 'ahead'
          ? `미푸시 커밋 ${branch.ahead}개`
          : branch.remoteStatus === 'same'
            ? '원격과 동일'
            : branch.remoteStatus === 'behind'
              ? `원격보다 ${branch.behind}개 뒤처짐`
              : branch.remoteStatus === 'diverged'
                ? '원격과 분기됨'
                : '확인 불가';
const branchOptionLabel = (branch) =>
    [
        branch.name,
        remoteLabel(branch),
        branch.hasWorkingChanges ? '작업 중 변경 있음' : '',
    ]
        .filter(Boolean)
        .join(' · ');
const selectedLocalBranch = () =>
    localBranchDetails.find((branch) => branch.name === select.value);
function inputNotice() {
    updateSyncAction();
    if (!localId || !loaded) {
        updateSchemaComparison();
        return;
    }
    const details = selectedLocalBranch();
    const base = details?.base
        ? `분기 비교 기준: ${details.base.branch}와 마지막으로 공유하는 커밋 ${details.base.commit.slice(0, 7)}`
        : '';
    const workingHint =
        details?.hasWorkingChanges && select.value !== currentLocalBranch
            ? '커밋하지 않은 변경은 반영하지 않습니다.'
            : '';
    const checked = details?.checkedAt
        ? `GitHub 확인 ${details.checkedAt}`
        : '';
    const commits = details?.commit
        ? details.remoteCommit
            ? `원격 ${details.remoteCommit.slice(0, 7)} ↔ 로컬 ${details.commit.slice(0, 7)}`
            : `로컬 ${details.commit.slice(0, 7)}`
        : '';
    branchStatus.textContent = [
        '원격에 푸시했는지와 관계없이, 선택한 로컬 브랜치에 커밋된 내용으로 스키마를 표시합니다. 커밋하지 않은 변경은 포함하지 않습니다.',
        details ? remoteLabel(details) : '',
        commits,
        base,
        checked,
        workingHint,
    ]
        .filter(Boolean)
        .join(' · ');
    updateSchemaComparison();
}
select.onchange = inputNotice;

checkRemote.onclick = async () => {
    const id = localId,
        branch = select.value;
    checkRemote.disabled = true;
    branchStatus.textContent = '원격 반영 확인 중…';
    try {
        const response = await fetch(
            `/api/local/check?local=${encodeURIComponent(id)}&branch=${encodeURIComponent(branch)}`,
            { cache: 'no-store' }
        );
        const payload = await response.json();
        if (id !== localId || branch !== select.value) return;
        if (!response.ok) throw new Error(payload.error);
        const details = selectedLocalBranch();
        if (details) {
            Object.assign(details, payload);
            const option = [...select.options].find(
                (candidate) => candidate.value === details.name
            );
            if (option) option.textContent = branchOptionLabel(details);
        }
        inputNotice();
    } catch (error) {
        if (id === localId)
            branchStatus.textContent = error.message || '원격 반영 여부 미확인';
    } finally {
        checkRemote.disabled = active;
    }
};
let loaded = false;
let schemaBlocked = '';
let repositoryUrl = '';
let primaryUrl = '';
let branchRequest = 0;
let snapshots = [];
let timer,
    active = false;
let highlightObserver;
let currentSnapshot;
function renderLocalBranchOptions(preferred) {
    const visible = localBranchDetails.filter(
        (branch) =>
            showAllLocalInput.checked ||
            branch.name === preferred ||
            branch.remoteStatus !== 'same' ||
            branch.hasWorkingChanges
    );
    select.replaceChildren(
        ...visible.map((branch) => {
            const option = document.createElement('option');
            option.value = branch.name;
            option.textContent = branchOptionLabel(branch);
            return option;
        })
    );
    select.value = visible.some((branch) => branch.name === preferred)
        ? preferred
        : visible.some((branch) => branch.name === currentLocalBranch)
          ? currentLocalBranch
          : (visible[0]?.name ?? '');
    loaded = visible.length > 0;
    branchStatus.textContent = loaded
        ? ''
        : '표시할 로컬 브랜치가 없습니다. 원격과 동일한 브랜치도 보기를 켜세요.';
    inputNotice();
}
showAllLocalInput.onchange = () => {
    const preferred = select.value;
    renderLocalBranchOptions(preferred);
    select.disabled = active || !loaded;
    refreshActions();
};
function selectedSnapshot() {
    return snapshots.find(
        (snapshot) =>
            snapshot.branch === select.value &&
            canonicalRepository(snapshot.repositoryUrl ?? primaryUrl) ===
                canonicalRepository(repositoryUrl) &&
            (localId
                ? snapshot.source?.kind === 'local' &&
                  snapshot.source.repositoryId === localId &&
                  snapshot.source.mode === 'commit'
                : !snapshot.source)
    );
}
function remoteSnapshot(branch) {
    return snapshots.find(
        (snapshot) =>
            snapshot.branch === branch &&
            canonicalRepository(snapshot.repositoryUrl ?? primaryUrl) ===
                canonicalRepository(repositoryUrl) &&
            !snapshot.source
    );
}
function updateSchemaComparison() {
    if (!localId || !loaded) {
        schemaStatus.hidden = true;
        schemaStatus.textContent = '';
        return;
    }
    schemaStatus.hidden = false;
    const local = selectedSnapshot();
    const details = selectedLocalBranch();
    const baselineBranch =
        details?.remoteStatus === 'unpublished'
            ? details.base?.branch
            : select.value;
    if (!local) {
        const base = details?.base;
        schemaStatus.textContent = base
            ? `Sync하면 ${base.branch}와 마지막으로 공유하는 커밋 ${base.commit.slice(0, 7)}을 분기 비교 기준으로 사용합니다. 그때의 스키마보다 추가되거나 변경된 테이블·필드를 형광 초록색으로 표시합니다.`
            : 'Sync하면 기준 브랜치와 마지막으로 공유하는 커밋을 찾아 분기 지점의 스키마와 비교합니다. 이후 추가되거나 변경된 테이블·필드를 형광 초록색으로 표시합니다. 비교 기준을 찾지 못하면 별도로 안내합니다.';
        return;
    }
    const comparison = local.schemaAdditions?.comparison;
    if (comparison?.kind === 'branch-base') {
        schemaStatus.textContent = `형광 초록색은 ${comparison.branch}와 마지막으로 공유하는 커밋 ${comparison.revision.slice(0, 7)}의 스키마보다 추가되거나 변경된 테이블·필드입니다. 기준 브랜치의 현재 최신 상태가 아니라, 두 브랜치가 갈라지는 지점의 커밋과 비교합니다.`;
        return;
    }
    if (comparison?.kind === 'unavailable') {
        schemaStatus.textContent = comparison.reason;
        return;
    }
    if (!baselineBranch) {
        schemaStatus.textContent =
            '비교할 원격 기준 브랜치를 결정할 수 없습니다.';
        return;
    }
    const remote = remoteSnapshot(baselineBranch);
    if (!remote) {
        schemaStatus.textContent = `GitHub ${baselineBranch} 기준 ERD를 먼저 Sync하면 스키마 차이를 표시합니다.`;
        return;
    }
    const difference = summarizeSchemaDifference(remote.diagram, local.diagram);
    schemaStatus.textContent = `GitHub ${baselineBranch} 대비 스키마 · 테이블 +${difference.tables.added}/-${difference.tables.removed} · 컬럼 +${difference.fields.added}/-${difference.fields.removed}/변경 ${difference.fields.changed} · 관계 +${difference.relationships.added}/-${difference.relationships.removed}`;
}
function refreshActions() {
    updateSyncAction();
    updateSchemaComparison();
    selectionSummary.textContent = loaded
        ? `${localId ? '로컬 Git' : 'GitHub 원격'} · ${repositoryUrl.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')} · ${select.value}`
        : '조직·저장소와 브랜치를 선택하면 Sync 입력 기준을 확인할 수 있습니다.';
    selectionTooltip.classList.toggle('remote-help', home && !localId);
    if (home && !localId)
        selectionSummary.textContent =
            '로컬 저장소를 선택하면 커밋·원격 반영 상태·스키마 비교 기준을 확인할 수 있습니다.';
    syncButton.disabled = active || !loaded || Boolean(schemaBlocked);
    const snapshot = loaded ? selectedSnapshot() : undefined;
    inputStatus.hidden = !snapshot?.schemaSource && !schemaBlocked;
    inputStatus.textContent = schemaBlocked
        ? schemaBlocked
        : snapshot?.schemaSource
          ? `스키마 입력 · ${snapshot.schemaSource.label} · ${snapshot.schemaSource.path} · ${snapshot.schemaSource.files}개`
          : '';
    if (!openButton) return;
    openButton.disabled = active || !loaded;
    openButton.title = snapshot
        ? '저장된 ERD 작업 데이터를 바로 엽니다.'
        : '저장된 ERD가 없어 스키마를 생성한 뒤 엽니다.';
}
async function loadBranches(preferredBranch, refreshFromGitHub = false) {
    if (!repositoryUrl) return false;
    let succeeded = false;
    const request = ++branchRequest;
    refresh.disabled = true;
    select.disabled = true;
    syncButton.disabled = true;
    if (openButton) openButton.disabled = true;
    branchStatus.textContent = localId
        ? '로컬 브랜치 조회 중…'
        : 'GitHub 브랜치 조회 중…';
    try {
        const response = await fetch(
            localId
                ? `/api/local/branches?local=${encodeURIComponent(localId)}`
                : `/api/branches?repository=${encodeURIComponent(repositoryUrl)}${refreshFromGitHub ? '&refresh=1' : ''}`,
            { cache: 'no-store' }
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        const snapshotPayload = await fetch('/data/snapshots.json', {
            cache: 'no-store',
        }).then((r) => (r.ok ? r.json() : { snapshots: [] }));
        if (request !== branchRequest) return false;
        snapshots = snapshotPayload.snapshots;
        const current = snapshots.find(
            (s) =>
                location.pathname === `/diagrams/${s.diagram.id}` &&
                canonicalRepository(s.repositoryUrl ?? primaryUrl) ===
                    canonicalRepository(repositoryUrl)
        )?.branch;
        currentLocalBranch = payload.current ?? '';
        showAllLocal.hidden = !localId;
        checkRemote.hidden = !localId;
        select.setAttribute(
            'aria-label',
            localId ? '동기화할 로컬 브랜치' : '동기화할 GitHub 브랜치'
        );
        syncButton.setAttribute(
            'aria-label',
            localId ? '로컬 스키마 Sync' : 'GitHub 스키마 Sync'
        );
        const preferred = preferredBranch || select.value || current;
        localBranchDetails = localId
            ? payload.branches.map((branch) =>
                  typeof branch === 'string'
                      ? {
                            name: branch,
                            remoteStatus: 'unconfirmed',
                            ahead: 0,
                            behind: 0,
                            hasWorkingChanges: false,
                            worktreePath: null,
                            base: null,
                        }
                      : branch
              )
            : [];
        if (localId) {
            renderLocalBranchOptions(preferred);
        } else {
            select.replaceChildren(
                ...payload.branches.map((branch) => {
                    const option = document.createElement('option');
                    option.value = branch;
                    option.textContent = branch;
                    return option;
                })
            );
            select.value = payload.branches.includes(preferred)
                ? preferred
                : payload.branches.includes(current)
                  ? current
                  : payload.branches.includes('develop')
                    ? 'develop'
                    : (payload.branches[0] ?? '');
            loaded = payload.branches.length > 0;
            branchStatus.textContent = loaded
                ? ''
                : '저장소에 브랜치가 없습니다.';
        }
        succeeded = true;
    } catch (error) {
        if (request !== branchRequest) return;
        branchStatus.textContent =
            error.message || '브랜치 조회 실패. 새로고침으로 다시 시도하세요.';
    } finally {
        if (request === branchRequest) {
            refresh.disabled = active || !repositoryUrl;
            select.disabled = active || !loaded;
            refreshActions();
            window.dispatchEvent(new CustomEvent('local-erd-branches-ready'));
        }
    }
    return succeeded;
}
refresh.onclick = () => loadBranches(undefined, true);
select.onchange = () => {
    schemaBlocked = '';
    inputNotice();
    refreshActions();
};
function busy() {
    active = true;
    window.dispatchEvent(new CustomEvent('local-erd-busy', { detail: true }));
    toolbar.classList.add('busy');
    syncButton.disabled = true;
    if (openButton) openButton.disabled = true;
    select.disabled = true;
    if (refresh) refresh.disabled = true;
    checkRemote.disabled = true;
    if (sourceBasis) sourceBasis.disabled = true;
    document.querySelector('#erd-sync-title').textContent = localId
        ? '로컬 스키마 동기화'
        : 'GitHub 스키마 동기화';
    label.textContent = 'Syncing';
    panel.classList.add('visible');
    close.hidden = true;
    panel.tabIndex = -1;
    panel.focus();
}
function fail(text) {
    clearTimeout(timer);
    active = false;
    window.dispatchEvent(new CustomEvent('local-erd-busy', { detail: false }));
    toolbar.classList.remove('busy');
    refreshActions();
    select.disabled = !loaded;
    if (refresh) refresh.disabled = false;
    checkRemote.disabled = false;
    if (sourceBasis) sourceBasis.disabled = false;
    updateSyncAction();
    message.textContent = text;
    close.hidden = false;
    close.focus();
}
close.onclick = () => {
    panel.classList.remove('visible');
    syncButton.focus();
};
async function track(job) {
    message.textContent = job.message;
    progress.value = job.progress;
    if (job.status === 'success') {
        label.textContent = '완료';
        setTimeout(
            () =>
                location.assign(
                    `/diagrams/${encodeURIComponent(job.diagramId)}`
                ),
            800
        );
        return;
    }
    if (job.status === 'error') {
        if (
            [
                'SCHEMA_METHOD_UNSUPPORTED',
                'SCHEMA_CONFIGURATION_MISSING',
                'SCHEMA_CONFIGURATION_AMBIGUOUS',
                'SCHEMA_VERSION_UNSUPPORTED',
            ].includes(job.code)
        )
            schemaBlocked = job.message;
        fail(job.message);
        return;
    }
    if (job.status !== 'running') {
        fail('동기화 작업을 찾지 못했습니다. 다시 시도해주세요.');
        return;
    }
    timer = setTimeout(async () => {
        try {
            const r = await fetch('/api/sync', { cache: 'no-store' });
            if (!r.ok) throw new Error();
            await track(await r.json());
        } catch {
            fail('동기화 상태를 확인할 수 없습니다. 서버 연결을 확인해주세요.');
        }
    }, 700);
}
async function synchronize(opening = false) {
    if (active) return;
    busy();
    message.textContent = opening
        ? '저장된 ERD가 없어 스키마를 생성하는 중…'
        : '편집 내용을 저장하고 동기화를 준비하는 중…';
    progress.value = 1;
    // Let ChartDB finish pending local saves before reloading the diagram.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
        const r = await fetch(
            `/api/sync?branch=${encodeURIComponent(select.value)}&repository=${encodeURIComponent(repositoryUrl)}${localId ? `&local=${encodeURIComponent(localId)}&mode=commit` : ''}`,
            {
                method: 'POST',
                headers: { 'X-Local-ERD': 'sync' },
            }
        );
        if (r.status === 409) {
            await track(await r.json());
            return;
        }
        if (!r.ok) {
            const payload = await r.json();
            throw new Error(payload.error);
        }
        await track(await r.json());
    } catch (error) {
        fail(
            error.message ||
                '동기화를 시작하지 못했습니다. 로컬 서버 연결을 확인해주세요.'
        );
    }
}
syncButton.onclick = () => synchronize(false);
if (openButton)
    openButton.onclick = () => {
        const snapshot = selectedSnapshot();
        if (snapshot) {
            location.assign(
                `/diagrams/${encodeURIComponent(snapshot.diagram.id)}`
            );
            return;
        }
        synchronize(true);
    };
fetch('/api/sync', { cache: 'no-store' })
    .then((r) => r.json())
    .then((job) => {
        if (job.status === 'running') {
            busy();
            track(job);
        }
    })
    .catch(() => {});
window.addEventListener('local-erd-repository', (event) => {
    if (active) return;
    schemaBlocked = '';
    const sameSource =
        repositoryUrl === event.detail.repositoryUrl &&
        localId === (event.detail.localId ?? '');
    const preferredBranch = sameSource ? select.value : undefined;
    repositoryUrl = event.detail.repositoryUrl;
    primaryUrl = event.detail.primaryUrl;
    localId = event.detail.localId ?? '';
    localBranchDetails = [];
    if (home) showWorktree(localId, '현재 선택 worktree');
    updateSyncAction();
    if (!sameSource) {
        loaded = false;
        select.replaceChildren();
    }
    loadBranches(preferredBranch, event.detail.refreshBranches === true);
});
window.addEventListener('local-erd-auth', () => {
    if (active) return;
    schemaBlocked = '';
    ++branchRequest;
    repositoryUrl = '';
    localId = '';
    localBranchDetails = [];
    showAllLocal.hidden = true;
    checkRemote.hidden = true;
    loaded = false;
    select.replaceChildren();
    select.disabled = true;
    syncButton.disabled = true;
    updateSyncAction();
    schemaStatus.hidden = true;
    inputStatus.hidden = true;
    if (home) showWorktree('', '현재 선택 worktree');
    if (openButton) openButton.disabled = true;
    if (refresh) refresh.disabled = true;
});
function applySchemaHighlights(additions) {
    const tableIds = new Set([
        ...(additions.newTableIds ?? []),
        ...(additions.changedTableIds ?? []),
    ]);
    const fieldIds = new Set([
        ...(additions.newFieldIds ?? []),
        ...(additions.changedFieldIds ?? []),
    ]);
    const apply = () => {
        const canvas = document.querySelector('#canvas');
        if (!canvas) return;
        canvas.classList.toggle('local-erd-all-new', additions.allTablesNew);
        for (const table of canvas.querySelectorAll('[data-table-id]'))
            table.classList.toggle(
                'local-erd-new-table',
                !additions.allTablesNew && tableIds.has(table.dataset.tableId)
            );
        for (const field of canvas.querySelectorAll('[data-field-id]'))
            field.classList.toggle(
                'local-erd-new-field',
                !additions.allTablesNew && fieldIds.has(field.dataset.fieldId)
            );
    };
    apply();
    highlightObserver?.disconnect();
    highlightObserver = new MutationObserver(apply);
    highlightObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
function showSchemaAdditions(current) {
    const additions = current?.schemaAdditions;
    if (!additions) {
        if (!current) return;
        diffBadge.hidden = false;
        diffBadge.classList.add('muted');
        renderDiffBadge(
            '비교 준비',
            '신규 표시를 준비하려면 이 브랜치를 한 번 Sync하세요'
        );
        return;
    }
    diffBadge.hidden = false;
    diffBadge.classList.remove('muted');
    const comparison = additions.comparison;
    if (comparison?.kind === 'unavailable') {
        diffBadge.classList.add('muted');
        renderDiffBadge('비교 불가', comparison.reason);
        applySchemaHighlights(additions);
        return;
    }
    const basis =
        comparison?.kind === 'branch-base'
            ? `${comparison.branch}와 분기 비교 기준 ${comparison.revision.slice(0, 7)}`
            : '직전 Sync';
    const newTables = additions.newTableIds?.length ?? 0;
    const changedTables = additions.changedTableIds?.length ?? 0;
    const newFields = additions.newFieldIds?.length ?? 0;
    const changedFields = additions.changedFieldIds?.length ?? 0;
    const removedTables = additions.removedTables ?? 0;
    const removedFields = additions.removedFields ?? 0;
    if (additions.allTablesNew)
        renderDiffBadge('전체 신규', `${basis} 대비 · 전체 테이블 신규`);
    else if (
        newTables ||
        changedTables ||
        newFields ||
        changedFields ||
        removedTables ||
        removedFields
    )
        renderDiffBadge(
            '스키마 변경 정보',
            `${basis} 대비 · 테이블 +${newTables}/변경 ${changedTables}/-${removedTables} · 필드 +${newFields}/변경 ${changedFields}/-${removedFields}`
        );
    else {
        diffBadge.classList.add('muted');
        renderDiffBadge('변경 없음', `${basis} 대비 스키마 변경이 없습니다`);
    }
    applySchemaHighlights(additions);
}
if (
    location.pathname.startsWith('/diagrams/') &&
    typeof BroadcastChannel === 'function'
) {
    const libraryChannel = new BroadcastChannel('local-erd-library');
    libraryChannel.onmessage = (event) => {
        const id = decodeURIComponent(
            location.pathname.slice('/diagrams/'.length)
        );
        if (
            Array.isArray(event.data?.deleted) &&
            event.data.deleted.includes(id)
        )
            location.assign('/saved');
    };
}
if (!home) {
    let sourceRequest = 0;
    async function switchSyncSource(source) {
        if (active) return;
        const request = ++sourceRequest;
        const previousLocalId = localId;
        const preferredBranch = select.value || currentSnapshot?.branch;
        sourceBasis.disabled = true;
        loaded = false;
        select.disabled = true;
        syncButton.disabled = true;
        branchStatus.textContent =
            source === 'local'
                ? '등록된 로컬 저장소를 확인하는 중…'
                : 'GitHub 원격 브랜치로 전환하는 중…';
        try {
            if (source === 'remote') {
                localId = '';
            } else {
                const response = await fetch('/api/local/repositories', {
                    cache: 'no-store',
                });
                const payload = await response.json();
                if (request !== sourceRequest) return;
                if (!response.ok) throw new Error(payload.error);
                const candidates = payload.repositories.filter(
                    (repo) =>
                        canonicalRepository(repo.repositoryUrl) ===
                        canonicalRepository(repositoryUrl)
                );
                const preferredId =
                    currentSnapshot?.source?.repositoryId ??
                    localStorage.getItem('local-erd-selected-local');
                const local =
                    candidates.find((repo) => repo.id === preferredId) ??
                    candidates[0];
                if (!local)
                    throw new Error(
                        '이 GitHub 레포의 로컬 clone/worktree를 메인 화면에서 먼저 등록하세요.'
                    );
                localId = local.id;
                localStorage.setItem('local-erd-selected-local', local.id);
            }
            localBranchDetails = [];
            updateSyncAction();
            const branchesLoaded = await loadBranches(preferredBranch);
            if (request !== sourceRequest) return;
            if (!branchesLoaded)
                throw new Error(
                    branchStatus.textContent || '브랜치를 불러오지 못했습니다.'
                );
        } catch (error) {
            if (request !== sourceRequest) return;
            localId = previousLocalId;
            updateSyncAction();
            try {
                await loadBranches(preferredBranch);
            } catch {
                loaded = false;
                select.disabled = true;
                syncButton.disabled = true;
            }
            branchStatus.textContent =
                error.message || 'Sync 기준을 전환하지 못했습니다.';
        } finally {
            if (request === sourceRequest) sourceBasis.disabled = active;
        }
    }
    sourceBasis.onchange = () => switchSyncSource(sourceBasis.value);
    createRepositorySwitcher({
        getCurrent: () => ({
            repositoryUrl,
            branch: currentSnapshot?.branch ?? select.value,
            localId: localId || undefined,
            mode: 'commit',
        }),
        onChoose: async (selection) => {
            repositoryUrl = selection.repositoryUrl;
            localId = selection.source === 'local' ? selection.localId : '';
            if (localId)
                localStorage.setItem('local-erd-selected-local', localId);
            updateSyncAction();
            toolbar.title = repositoryUrl
                .replace('https://github.com/', '')
                .replace(/\.git$/, '');
            select.replaceChildren();
            await loadBranches(selection.branch);
            if (select.value !== selection.branch)
                throw new Error('선택한 브랜치를 불러오지 못했습니다.');
            await synchronize(false);
        },
    });
    Promise.all([
        fetch('/api/context', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/data/snapshots.json', { cache: 'no-store' }).then((r) =>
            r.json()
        ),
    ])
        .then(([context, data]) => {
            primaryUrl = context.primaryUrl;
            const current = data.snapshots.find(
                (s) => location.pathname === `/diagrams/${s.diagram.id}`
            );
            currentSnapshot = current;
            showCurrentWorktree(current);
            if (current && layoutButton) {
                try {
                    currentLayoutSource = snapshotLayoutSource(
                        current,
                        context.primaryUrl
                    );
                    layoutButton.disabled = false;
                } catch {
                    currentLayoutSource = undefined;
                    layoutButton.disabled = true;
                }
            }
            repositoryUrl = current?.repositoryUrl ?? primaryUrl;
            localId =
                current?.source?.kind === 'local'
                    ? current.source.repositoryId
                    : '';
            updateSyncAction();
            if (current?.source) {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = `로컬 ${current.source.mode === 'worktree' ? '작업 중 입력' : '브랜치 커밋'} · 출처 정보`;
                const badge = document.createElement('p');
                badge.textContent = `${current.source.notice} · commit: ${current.source.commit.slice(0, 12)} · 캡처: ${current.source.capturedAt} · 입력: ${current.source.fingerprint}${current.source.checkedAt ? ` · 원격 확인: ${current.source.checkedAt}` : ''}`;
                details.append(summary, badge);
                info.querySelector('#erd-info-tooltip').append(details);
                style.textContent +=
                    '#erd-sync{max-width:min(650px,calc(100vw - 30px));justify-content:flex-end}#erd-sync details{flex-basis:100%;font:11px system-ui;text-align:right}#erd-sync summary{cursor:pointer}#erd-sync details p{padding:12px;background:#172131;border:1px solid #364152;border-radius:9px;overflow-wrap:anywhere;line-height:1.5}';
            }
            toolbar.title = repositoryUrl
                .replace('https://github.com/', '')
                .replace(/\.git$/, '');
            loadBranches(current?.branch);
            showSchemaAdditions(current);
        })
        .catch(() => {
            branchStatus.textContent =
                '레포 정보를 불러오지 못했습니다. 페이지를 새로고침하세요.';
        });
}
