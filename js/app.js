"use strict";
/* 姿勢ライン — 前額面/矢状面の2枚を整え、横A4 1枚に並べて書き出すPWA */

(() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  // ---- A4横レイアウト(300dpi相当) ----
  const A4 = { W: 3508, H: 2480, M: 100, G: 80, HH: 130, FH: 110 };
  function a4cells() {
    const { W, H, M, G, HH, FH } = A4;
    const cw = (W - 2 * M - G) / 2;
    const top = M + HH;
    const ch = H - M - FH - top;
    return { cw, ch, top, cells: [
      { x: M, y: top, w: cw, h: ch },
      { x: M + cw + G, y: top, w: cw, h: ch },
    ] };
  }
  const CELL_ASPECT = (() => { const { cw, ch } = a4cells(); return cw / ch; })();

  // ---- スロット(写真2枚)の状態 ----
  function newSlot(label) {
    return { img: null, rot: 0, scale: 1, fitScale: 1, tx: 0, ty: 0,
             plumbX: 0, plumbOn: true, plumbW: 2, gridOn: false, gridGap: 48, label };
  }
  const slots = [newSlot("前額面"), newSlot("矢状面")];
  let cur = 0;
  let S = slots[cur];

  let stageW = 0, stageH = 0, dpr = 1;
  const cx = () => stageW / 2;
  const cy = () => stageH / 2;

  // ---- 編集フレーム(=A4セルと同じ縦横比) ----
  function frameRect() {
    const margin = 14;
    const availW = stageW - margin * 2, availH = stageH - margin * 2;
    let w = availW, h = w / CELL_ASPECT;
    if (h > availH) { h = availH; w = h * CELL_ASPECT; }
    return { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
  }

  // ===== 編集画面の描画(現在スロットS) =====
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!S.img) return;
    const fr = frameRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 画像(ステージ全体に描画→枠外は後でマスク)
    ctx.save();
    ctx.translate(cx() + S.tx, cy() + S.ty);
    ctx.rotate((S.rot * Math.PI) / 180);
    ctx.scale(S.scale, S.scale);
    ctx.drawImage(S.img, -S.img.width / 2, -S.img.height / 2);
    ctx.restore();

    // オーバーレイ(枠内)
    ctx.save();
    ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
    drawOverlay(ctx, fr, S, 1);
    ctx.restore();

    // 枠外マスク + 枠線
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, stageW, stageH);
    ctx.rect(fr.x, fr.y, fr.w, fr.h);
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
  }

  // 重心線・グリッドを矩形frに描く(scale=線幅倍率)
  function drawOverlay(c, fr, sl, lw) {
    const plumbX = sl.plumbX;
    const gap = sl.gridGap * lw;
    if (sl.gridOn) {
      c.strokeStyle = "rgba(226,59,59,0.55)";
      c.lineWidth = Math.max(1, lw);
      c.beginPath();
      for (let x = plumbX; x <= fr.x + fr.w; x += gap) { c.moveTo(x, fr.y); c.lineTo(x, fr.y + fr.h); }
      for (let x = plumbX - gap; x >= fr.x; x -= gap) { c.moveTo(x, fr.y); c.lineTo(x, fr.y + fr.h); }
      const ay = fr.y + fr.h / 2;
      for (let y = ay; y <= fr.y + fr.h; y += gap) { c.moveTo(fr.x, y); c.lineTo(fr.x + fr.w, y); }
      for (let y = ay - gap; y >= fr.y; y -= gap) { c.moveTo(fr.x, y); c.lineTo(fr.x + fr.w, y); }
      c.stroke();
    }
    if (sl.plumbOn) {
      c.strokeStyle = "rgba(226,59,59,0.95)";
      c.lineWidth = Math.max(1.5, sl.plumbW * lw);
      c.beginPath(); c.moveTo(plumbX, fr.y); c.lineTo(plumbX, fr.y + fr.h); c.stroke();
    }
  }

  // ===== A4合成: スロットをセル矩形dに描く(efは編集フレーム) =====
  function paintSlot(c, d, sl, ef) {
    c.save();
    c.beginPath(); c.rect(d.x, d.y, d.w, d.h); c.clip();
    c.fillStyle = "#ffffff"; c.fillRect(d.x, d.y, d.w, d.h);
    const sx = d.w / ef.w; // 編集フレーム→セルの拡大率

    if (sl.img) {
      const ncx = (ef.w / 2 + sl.tx) / ef.w;
      const ncy = (ef.h / 2 + sl.ty) / ef.h;
      c.save();
      c.translate(d.x + ncx * d.w, d.y + ncy * d.h);
      c.rotate((sl.rot * Math.PI) / 180);
      c.scale(sl.scale * sx, sl.scale * sx);
      c.drawImage(sl.img, -sl.img.width / 2, -sl.img.height / 2);
      c.restore();

      // オーバーレイ(セル座標で計算)
      const plumbX = d.x + ((sl.plumbX - ef.x) / ef.w) * d.w;
      const gap = sl.gridGap * sx;
      if (sl.gridOn) {
        c.strokeStyle = "rgba(226,59,59,0.55)"; c.lineWidth = Math.max(1.5, sx);
        c.beginPath();
        for (let x = plumbX; x <= d.x + d.w; x += gap) { c.moveTo(x, d.y); c.lineTo(x, d.y + d.h); }
        for (let x = plumbX - gap; x >= d.x; x -= gap) { c.moveTo(x, d.y); c.lineTo(x, d.y + d.h); }
        const ay = d.y + d.h / 2;
        for (let y = ay; y <= d.y + d.h; y += gap) { c.moveTo(d.x, y); c.lineTo(d.x + d.w, y); }
        for (let y = ay - gap; y >= d.y; y -= gap) { c.moveTo(d.x, y); c.lineTo(d.x + d.w, y); }
        c.stroke();
      }
      if (sl.plumbOn) {
        c.strokeStyle = "rgba(226,59,59,0.95)"; c.lineWidth = Math.max(2, sl.plumbW * sx);
        c.beginPath(); c.moveTo(plumbX, d.y); c.lineTo(plumbX, d.y + d.h); c.stroke();
      }
    } else {
      c.fillStyle = "#9aa6b3";
      c.font = `${Math.round(d.w * 0.07)}px -apple-system,'Hiragino Sans',sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("（未設定）", d.x + d.w / 2, d.y + d.h / 2);
    }
    c.restore();
    c.strokeStyle = "#c9d2dc"; c.lineWidth = Math.max(1, sx);
    c.strokeRect(d.x, d.y, d.w, d.h);
  }

  function buildA4() {
    const { W, H, M, HH } = A4;
    const page = document.createElement("canvas");
    page.width = W; page.height = H;
    const c = page.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
    const { cells } = a4cells();
    const ef = frameRect();
    for (let i = 0; i < 2; i++) {
      paintSlot(c, cells[i], slots[i], ef);
      c.fillStyle = "#1c222b"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "bold 70px -apple-system,'Hiragino Sans',sans-serif";
      c.fillText(slots[i].label, cells[i].x + cells[i].w / 2, M + HH / 2);
    }
    c.font = "46px -apple-system,'Hiragino Sans',sans-serif";
    c.textAlign = "right"; c.textBaseline = "middle";
    c.fillStyle = "#555";
    c.fillText(dateStr(), W - M, M + HH / 2);
    return page;
  }

  // ---- リサイズ ----
  function resize() {
    const r = $("stage").getBoundingClientRect();
    stageW = r.width; stageH = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(stageW * dpr);
    canvas.height = Math.round(stageH * dpr);
    slots.forEach((sl) => { if (sl.plumbX === 0) sl.plumbX = cx(); });
    render();
  }

  // ---- 画像読み込み ----
  function recenterFit() {
    if (!S.img) return;
    const fr = frameRect();
    const s = Math.min(fr.w / S.img.width, fr.h / S.img.height);
    S.fitScale = s; S.scale = s; S.tx = 0; S.ty = 0;
  }
  function resetView() {
    recenterFit();
    S.rot = 0;
  }
  function loadImage(file) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      S.img = im;
      S.plumbX = cx();
      resetView();
      syncControls();
      render();
      URL.revokeObjectURL(url);
    };
    im.src = url;
  }

  // ---- UI同期 ----
  function syncControls() {
    $("tilt-range").value = String(S.rot);
    $("tilt-val").textContent = `${(+S.rot).toFixed(1)}°`;
    $("plumb-on").checked = S.plumbOn;
    $("plumb-w").value = String(S.plumbW);
    $("grid-on").checked = S.gridOn;
    $("grid-gap").value = String(S.gridGap);
    $("hint").style.display = S.img ? "none" : "flex";
    $("hint-label").textContent = S.label;
    document.querySelectorAll(".slotbtn").forEach((b) => {
      const i = +b.dataset.slot;
      b.classList.toggle("active", i === cur);
      b.classList.toggle("has", !!slots[i].img);
    });
    $("btn-export").disabled = !(slots[0].img || slots[1].img);
  }
  function switchSlot(i) {
    cur = i; S = slots[cur];
    if (S.plumbX === 0) S.plumbX = cx();
    syncControls(); render();
  }

  // ---- 書き出し(A4プレビュー → 写真に保存) ----
  function dataURLToBlob(d) {
    const [head, b64] = d.split(",");
    const mime = (head.match(/:(.*?);/) || [, "image/jpeg"])[1];
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }
  function dateStr() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  }
  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function exportA4() {
    if (!(slots[0].img || slots[1].img)) return;
    const url = buildA4().toDataURL("image/jpeg", 0.92);
    showPreview(url);
  }

  function showPreview(url) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    const img = document.createElement("img");
    img.src = url; img.className = "ov-img";
    const msg = document.createElement("p");
    msg.className = "ov-msg";
    msg.textContent = "このA4を「写真に保存」、または画像を長押しで保存できます";
    const row = document.createElement("div"); row.className = "ov-row";
    const save = document.createElement("button"); save.className = "ov-btn primary"; save.textContent = "写真に保存";
    const close = document.createElement("button"); close.className = "ov-btn"; close.textContent = "閉じる";
    close.onclick = () => ov.remove();
    // 保存はこのタップ操作の中で同期的にshareを呼ぶ(iOS対策)
    save.onclick = () => {
      const blob = dataURLToBlob(url);
      const file = new File([blob], `posture_A4_${stamp()}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch((e) => {
          if (!(e && e.name === "AbortError")) msg.textContent = "共有できませんでした。画像を長押しして保存してください。";
        });
      } else {
        msg.textContent = "この端末では画像を長押しして「写真に追加」で保存してください。";
      }
    };
    row.append(save, close);
    ov.append(img, msg, row);
    document.body.appendChild(ov);
  }

  // ---- ジェスチャー ----
  const pts = new Map();
  let mode = null, startTx = 0, startTy = 0;
  let pinchStartDist = 0, pinchStartScale = 1, pinchMid = null;
  function localXY(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!S.img) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = localXY(e); pts.set(e.pointerId, p);
    if (pts.size === 2) {
      const a = [...pts.values()];
      pinchStartDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      pinchStartScale = S.scale;
      pinchMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      mode = "pinch"; return;
    }
    if (S.plumbOn && Math.abs(p.x - S.plumbX) < 22) { mode = "plumb"; }
    else { mode = "pan"; startTx = S.tx; startTy = S.ty; }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = localXY(e); const prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
    if (mode === "pinch" && pts.size >= 2) {
      const a = [...pts.values()];
      const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      const newScale = clamp(pinchStartScale * (dist / pinchStartDist), S.fitScale * 0.2, S.fitScale * 8);
      const k = newScale / S.scale;
      S.tx = (S.tx - (mid.x - cx())) * k + (mid.x - cx());
      S.ty = (S.ty - (mid.y - cy())) * k + (mid.y - cy());
      S.tx += mid.x - pinchMid.x; S.ty += mid.y - pinchMid.y;
      pinchMid = mid; S.scale = newScale; render(); return;
    }
    if (mode === "plumb") {
      const fr = frameRect();
      S.plumbX = clamp(p.x, fr.x, fr.x + fr.w); render(); return;
    }
    if (mode === "pan") { S.tx += p.x - prev.x; S.ty += p.y - prev.y; render(); }
  });
  function endPointer(e) {
    pts.delete(e.pointerId);
    if (pts.size === 0) mode = null;
    else if (pts.size === 1) mode = "pan";
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  // ---- 拡大 ----
  function zoomBy(f) { S.scale = clamp(S.scale * f, S.fitScale * 0.2, S.fitScale * 8); render(); }
  $("zoom-in").onclick = () => zoomBy(1.15);
  $("zoom-out").onclick = () => zoomBy(1 / 1.15);
  $("zoom-fit").onclick = () => { recenterFit(); render(); };

  // ---- タブ ----
  document.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      document.querySelectorAll(".pane").forEach((p) =>
        p.classList.toggle("active", p.dataset.pane === t.dataset.tab));
    };
  });

  // ---- スロット切替 ----
  document.querySelectorAll(".slotbtn").forEach((b) => {
    b.onclick = () => switchSlot(+b.dataset.slot);
  });

  // ---- 傾き ----
  function setTilt(v) {
    S.rot = clamp(v, -20, 20);
    $("tilt-range").value = String(S.rot);
    $("tilt-val").textContent = `${S.rot.toFixed(1)}°`;
    render();
  }
  $("tilt-range").oninput = (e) => setTilt(parseFloat(e.target.value));
  $("tilt-m1").onclick = () => setTilt(S.rot - 1);
  $("tilt-p1").onclick = () => setTilt(S.rot + 1);
  $("tilt-m01").onclick = () => setTilt(S.rot - 0.1);
  $("tilt-p01").onclick = () => setTilt(S.rot + 0.1);
  $("tilt-reset").onclick = () => setTilt(0);

  // ---- 重心線 ----
  $("plumb-on").onchange = (e) => { S.plumbOn = e.target.checked; render(); };
  $("plumb-w").oninput = (e) => { S.plumbW = parseInt(e.target.value, 10); render(); };
  $("plumb-center").onclick = () => { S.plumbX = cx(); render(); };

  // ---- グリッド ----
  $("grid-on").onchange = (e) => { S.gridOn = e.target.checked; render(); };
  $("grid-gap").oninput = (e) => { S.gridGap = parseInt(e.target.value, 10); render(); };

  // ---- ファイル/書き出し ----
  $("btn-load").onclick = () => $("file").click();
  $("file").onchange = (e) => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ""; };
  $("btn-export").onclick = exportA4;

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));
  resize();
  syncControls();
})();
