(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    files: [],
    selectedId: null,
    mode: "cover",
    rotation: 0,
    flipH: false,
    flipV: false,
    processing: false,
    aspect: 1,
    previewView: "live" // "live" | "original" | "optimized"
  };

  const els = {
    dropZone: $("dropZone"),
    fileInput: $("fileInput"),
    browseBtn: $("browseBtn"),
    addMoreBtn: $("addMoreBtn"),
    fileList: $("fileList"),
    queueCount: $("queueCount"),
    fileCount: $("fileCount"),
    previewImage: $("previewImage"),
    previewCanvas: $("previewCanvas"),
    emptyPreview: $("emptyPreview"),
    previewStatus: $("previewStatus"),
    previewToggle: $("previewToggle"),
    selectedName: $("selectedName"),
    dimensionsText: $("dimensionsText"),
    originalSizeText: $("originalSizeText"),
    beforeSize: $("beforeSize"),
    afterSize: $("afterSize"),
    beforeDimensions: $("beforeDimensions"),
    afterDimensions: $("afterDimensions"),
    savingsValue: $("savingsValue"),
    savingsBar: $("savingsBar"),
    width: $("widthInput"),
    height: $("heightInput"),
    lock: $("lockAspect"),
    preset: $("presetSelect"),
    format: $("formatSelect"),
    compression: $("compressionToggle"),
    quality: $("qualitySlider"),
    qualityValue: $("qualityValue"),
    target: $("targetToggle"),
    targetFields: $("targetFields"),
    targetSize: $("targetSize"),
    targetUnit: $("targetUnit"),
    flipH: $("flipH"),
    flipV: $("flipV"),
    process: $("processBtn"),
    downloadSelected: $("downloadSelectedBtn"),
    processAll: $("processAllBtn"),
    downloadAll: $("downloadAllBtn"),
    progressWrap: $("progressWrap"),
    progressLabel: $("progressLabel"),
    progressPercent: $("progressPercent"),
    progressBar: $("progressBar"),
    themeToggle: $("themeToggle"),
    toast: $("toast")
  };

  const bytes = (n) =>
    n < 1024
      ? `${n} B`
      : n < 1024 * 1024
      ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
      : `${(n / 1048576).toFixed(2)} MB`;

  const safeName = (s) =>
    s.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 70) || "image";

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const selected = () =>
    state.files.find((f) => f.id === state.selectedId) || null;

  const normalizedRotation = () => ((state.rotation % 360) + 360) % 360;

  function notify(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => els.toast.classList.remove("show"), 3000);
  }

  function setProgress(done, total, label) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    els.progressWrap.hidden = false;
    els.progressLabel.textContent = label;
    els.progressPercent.textContent = `${pct}%`;
    els.progressBar.style.width = `${pct}%`;
    if (pct === 100) {
      setTimeout(() => {
        els.progressWrap.hidden = true;
      }, 900);
    }
  }

  function getCropPercents() {
    return {
      t: clamp(Number($("cropTop").value) || 0, 0, 90),
      r: clamp(Number($("cropRight").value) || 0, 0, 90),
      b: clamp(Number($("cropBottom").value) || 0, 0, 90),
      l: clamp(Number($("cropLeft").value) || 0, 0, 90)
    };
  }

  function hasCrop() {
    const { t, r, b, l } = getCropPercents();
    return t > 0 || r > 0 || b > 0 || l > 0;
  }

  function hasActiveTransforms() {
    return normalizedRotation() !== 0 || state.flipH || state.flipV || hasCrop();
  }

  function syncTransformButtons() {
    els.flipH.classList.toggle("active", state.flipH);
    els.flipH.setAttribute("aria-pressed", String(state.flipH));
    els.flipV.classList.toggle("active", state.flipV);
    els.flipV.setAttribute("aria-pressed", String(state.flipV));
  }

  function syncPreviewToggle() {
    const item = selected();
    const hasProcessed = Boolean(item && item.processedBlob);
    els.previewToggle.hidden = !hasProcessed;

    els.previewToggle.querySelectorAll("button").forEach((btn) => {
      const isSelected =
        hasProcessed && btn.dataset.view === state.previewView;
      btn.classList.toggle("selected", isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function setPreviewBadge(text, variant = "") {
    els.previewStatus.textContent = text;
    els.previewStatus.classList.toggle("is-live", variant === "live");
    els.previewStatus.classList.toggle("is-warning", variant === "warning");
  }

  function describeLiveTransforms() {
    const tags = [];
    const rot = normalizedRotation();
    if (rot) tags.push(`${rot}°`);
    if (state.flipH) tags.push("Flip H");
    if (state.flipV) tags.push("Flip V");
    if (hasCrop()) tags.push("Cropped");
    return tags.length ? `Live · ${tags.join(" · ")}` : "Original preview";
  }

  function resetTransform() {
    state.rotation = 0;
    state.flipH = false;
    state.flipV = false;
    ["cropTop", "cropRight", "cropBottom", "cropLeft"].forEach((id) => {
      $(id).value = 0;
    });
    state.mode = "cover";
    document.querySelectorAll("#fitMode button").forEach((b) => {
      b.classList.toggle("selected", b.dataset.mode === "cover");
    });
    syncTransformButtons();
  }

  function calcSavings(original, after) {
    const v = (1 - after / original) * 100;
    if (v > 0) return `${v.toFixed(1)}% smaller`;
    if (v < 0) return `${Math.abs(v).toFixed(1)}% larger`;
    return "No change";
  }

  function addFiles(fileList) {
    const valid = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!valid.length) {
      notify("Choose a valid image file.");
      return;
    }

    let added = 0;
    valid.forEach((file) => {
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random());
      const url = URL.createObjectURL(file);
      const img = new Image();
      const item = {
        id,
        file,
        url,
        img,
        processedBlob: null,
        processedUrl: null,
        processedWidth: 0,
        processedHeight: 0,
        status: "Ready",
        error: null
      };

      img.onload = () => {
        item.width = img.naturalWidth;
        item.height = img.naturalHeight;
        renderQueue();
        if (!state.selectedId) {
          selectFile(id);
        } else if (state.selectedId === id) {
          updatePreviewPanel();
        }
      };

      img.onerror = () => {
        item.error = "Could not read image";
        item.status = "Error";
        renderQueue();
      };

      img.src = url;
      state.files.push(item);
      added++;
    });

    els.fileInput.value = "";
    renderQueue();
    if (added) {
      notify(`${added} image${added === 1 ? "" : "s"} added to queue.`);
    }
  }

  // Renders live rotation, flip, and crop onto the preview canvas.
  function renderLiveCanvas(item) {
    const img = item.img;
    if (!img.complete || !img.naturalWidth) {
      els.previewCanvas.hidden = true;
      els.previewImage.src = item.url;
      els.previewImage.hidden = false;
      setPreviewBadge("Loading…");
      return;
    }

    let crop;
    try {
      crop = cropRect(img);
    } catch (err) {
      els.previewCanvas.hidden = true;
      els.previewImage.src = item.url;
      els.previewImage.hidden = false;
      setPreviewBadge("Invalid crop area", "warning");
      return;
    }

    const rot = normalizedRotation();
    const isQuarterTurn = rot % 180 !== 0;
    const sw = isQuarterTurn ? crop.h : crop.w;
    const sh = isQuarterTurn ? crop.w : crop.h;

    const maxPreviewSide = 1200;
    const scale = Math.min(1, maxPreviewSide / Math.max(sw, sh));
    const canvasW = Math.max(1, Math.round(sw * scale));
    const canvasH = Math.max(1, Math.round(sh * scale));

    els.previewCanvas.width = canvasW;
    els.previewCanvas.height = canvasH;

    const ctx = els.previewCanvas.getContext("2d", { alpha: true });
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const drawW = isQuarterTurn ? canvasH : canvasW;
    const drawH = isQuarterTurn ? canvasW : canvasH;

    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(
      img,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH
    );
    ctx.restore();

    els.previewImage.hidden = true;
    els.previewCanvas.hidden = false;
    setPreviewBadge(
      describeLiveTransforms(),
      hasActiveTransforms() ? "live" : ""
    );
  }

  // Updates preview canvas/image & stats without resetting user resize/crop controls.
  function updatePreviewPanel() {
    const item = selected();
    if (!item) {
      els.previewImage.hidden = true;
      els.previewImage.removeAttribute("src");
      els.previewCanvas.hidden = true;
      els.emptyPreview.hidden = false;
      els.previewToggle.hidden = true;
      setPreviewBadge("Waiting for image");
      els.selectedName.textContent = "No image selected";
      els.dimensionsText.textContent = "—";
      els.originalSizeText.textContent = "—";
      els.beforeSize.textContent = "—";
      els.afterSize.textContent = "—";
      els.beforeDimensions.textContent = "—";
      els.afterDimensions.textContent = "—";
      els.savingsValue.textContent = "—";
      els.savingsBar.style.width = "0%";
      els.downloadSelected.disabled = true;
      return;
    }

    els.selectedName.textContent = item.file.name;
    els.dimensionsText.textContent = item.width
      ? `${item.width} × ${item.height}`
      : "Loading…";
    els.originalSizeText.textContent = bytes(item.file.size);
    els.beforeSize.textContent = bytes(item.file.size);
    els.beforeDimensions.textContent = item.width
      ? `${item.width} × ${item.height}`
      : "—";

    els.afterSize.textContent = item.processedBlob
      ? bytes(item.processedBlob.size)
      : "—";
    els.afterDimensions.textContent = item.processedBlob
      ? `${item.processedWidth} × ${item.processedHeight}`
      : "—";
    els.savingsValue.textContent = item.processedBlob
      ? calcSavings(item.file.size, item.processedBlob.size)
      : "—";
    els.savingsBar.style.width = item.processedBlob
      ? `${Math.max(
          0,
          Math.min(100, (1 - item.processedBlob.size / item.file.size) * 100)
        )}%`
      : "0%";

    els.emptyPreview.hidden = true;
    els.downloadSelected.disabled = !item.processedBlob || state.processing;

    // Fallback to live preview if optimized view was requested without a processed result.
    if (state.previewView === "optimized" && !item.processedUrl) {
      state.previewView = "live";
    }

    syncPreviewToggle();

    if (state.previewView === "optimized" && item.processedUrl) {
      els.previewCanvas.hidden = true;
      els.previewImage.src = item.processedUrl;
      els.previewImage.hidden = false;
      setPreviewBadge(`Optimized · ${bytes(item.processedBlob.size)}`);
    } else if (state.previewView === "original") {
      els.previewCanvas.hidden = true;
      els.previewImage.src = item.url;
      els.previewImage.hidden = false;
      setPreviewBadge(`Original · ${bytes(item.file.size)}`);
    } else {
      renderLiveCanvas(item);
    }
  }

  function triggerLiveTransformPreview() {
    syncTransformButtons();
    if (!selected()) return;
    state.previewView = "live";
    updatePreviewPanel();
  }

  // Switches the active file and initializes dimensions/transforms for that image.
  function selectFile(id) {
    const item = state.files.find((f) => f.id === id);
    if (!item) return;

    state.selectedId = id;
    resetTransform();
    els.preset.value = "custom";
    state.previewView = item.processedBlob ? "optimized" : "live";

    if (item.width && item.height) {
      els.width.value = item.width;
      els.height.value = item.height;
      state.aspect = item.width / item.height;
    }

    updatePreviewPanel();
    renderQueue();
  }

  function renderQueue() {
    const current = selected();
    els.queueCount.textContent = state.files.length;
    els.fileCount.textContent = state.files.length;
    els.downloadAll.disabled =
      !state.files.some((f) => f.processedBlob) || state.processing;
    
    els.process.disabled = !current || state.processing;
    els.processAll.disabled =
      !state.files.length || state.processing;

    
    els.downloadSelected.disabled =
      !current || !current.processedBlob || state.processing;

    if (!state.files.length) {
      els.fileList.innerHTML =
        '<div class="queue-empty">Your uploaded images will appear here.</div>';
      return;
    }

    els.fileList.innerHTML = "";
    state.files.forEach((item) => {
      const row = document.createElement("div");
      row.className = "file-item" + (item.id === state.selectedId ? " active" : "");
      row.addEventListener("click", () => selectFile(item.id));

      const thumb = document.createElement("img");
      thumb.className = "file-thumb";
      thumb.src = item.processedUrl || item.url;
      thumb.alt = "";

      const info = document.createElement("div");
      info.className = "file-info";

      const name = document.createElement("strong");
      name.textContent = item.file.name;

      const detail = document.createElement("span");
      detail.textContent = `${item.width || "…"} × ${item.height || "…"} · ${bytes(
        item.file.size
      )}`;
      info.append(name, detail);

      const status = document.createElement("span");
      status.className = "file-status" + (item.processedBlob ? " done" : "");
      status.textContent = item.processedBlob
        ? `Done · ${bytes(item.processedBlob.size)}`
        : item.status;

      const remove = document.createElement("button");
      remove.className = "remove-file";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Remove image";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFile(item.id);
      });

      row.append(thumb, info, status, remove);
      els.fileList.append(row);
    });
  }

  function removeFile(id) {
    const i = state.files.findIndex((f) => f.id === id);
    if (i < 0) return;

    const f = state.files[i];
    URL.revokeObjectURL(f.url);
    if (f.processedUrl) URL.revokeObjectURL(f.processedUrl);
    state.files.splice(i, 1);

    if (state.selectedId === id) {
      state.selectedId = null;
      if (state.files.length) {
        selectFile(state.files[0].id);
      } else {
        resetTransform();
        state.previewView = "live";
        updatePreviewPanel();
      }
    }
    renderQueue();
  }

  function cropRect(img) {
    const { t, r, b, l } = getCropPercents();
    const top = t / 100;
    const right = r / 100;
    const bottom = b / 100;
    const left = l / 100;

    if (top + bottom >= 0.95 || left + right >= 0.95) {
      throw new Error("Crop margins leave too little image area.");
    }

    return {
      x: img.naturalWidth * left,
      y: img.naturalHeight * top,
      w: img.naturalWidth * (1 - left - right),
      h: img.naturalHeight * (1 - top - bottom)
    };
  }

  function canvasFor(item) {
    const img = item.img;
    if (!img.complete || !img.naturalWidth) {
      throw new Error("Image is not ready yet.");
    }

    const crop = cropRect(img);
    const rot = normalizedRotation();
    const isQuarterTurn = rot % 180 !== 0;

    // Effective source dimensions after rotation.
    const sw = isQuarterTurn ? crop.h : crop.w;
    const sh = isQuarterTurn ? crop.w : crop.h;

    const outW = clamp(
      Math.round(Number(els.width.value) || sw),
      1,
      12000
    );
    const outH = clamp(
      Math.round(Number(els.height.value) || sh),
      1,
      12000
    );

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (els.format.value === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    }

    // Visual destination width & height in output-canvas space.
    let dw = outW;
    let dh = outH;
    if (state.mode === "contain") {
      const scale = Math.min(outW / sw, outH / sh);
      dw = sw * scale;
      dh = sh * scale;
    } else if (state.mode === "cover") {
      const scale = Math.max(outW / sw, outH / sh);
      dw = sw * scale;
      dh = sh * scale;
    }

    // Swap draw dimensions back for 90°/270° turns so local axes match crop axes.
    const drawW = isQuarterTurn ? dh : dw;
    const drawH = isQuarterTurn ? dw : dh;

    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(
      img,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH
    );
    ctx.restore();

    return canvas;
  }

  function toBlob(canvas, type, quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(
                new Error(
                  `This browser cannot export ${type
                    .replace("image/", "")
                    .toUpperCase()}. Try JPEG or WebP.`
                )
              ),
        type,
        quality
      )
    );
  }

  async function encodeCanvas(canvas, quality) {
    const type = els.format.value;
    if (type === "image/avif") {
      const test = await toBlob(canvas, type, quality).catch(() => null);
      if (!test || test.type !== "image/avif") {
        throw new Error(
          "AVIF export is not supported by this browser. Choose WebP or JPEG."
        );
      }
      return test;
    }
    return toBlob(canvas, type, quality);
  }

  async function findTargetBlob(canvas, targetBytes) {
    const type = els.format.value;
    if (type === "image/png") {
      throw new Error(
        "Target-size mode needs JPEG, WebP or AVIF. PNG does not offer lossy quality control."
      );
    }

    let low = 0.08;
    let high = 1;
    let best = null;

    for (let i = 0; i < 9; i++) {
      const q = (low + high) / 2;
      const blob = await encodeCanvas(canvas, q);
      if (blob.size <= targetBytes) {
        best = blob;
        low = q;
      } else {
        high = q;
      }
    }

    if (!best) {
      const smallest = await encodeCanvas(canvas, 0.08);
      return { blob: smallest, met: false };
    }

    return { blob: best, met: true };
  }

  async function processItem(item) {
    const canvas = canvasFor(item);
    let blob;

    if (els.target.checked) {
      const n = Number(els.targetSize.value);
      if (!n || n <= 0) throw new Error("Enter a valid target file size.");
      const targetBytes = n * (els.targetUnit.value === "MB" ? 1048576 : 1024);
      const result = await findTargetBlob(canvas, targetBytes);
      blob = result.blob;
      item.targetMet = result.met;
    } else {
      const q = els.compression.checked ? Number(els.quality.value) / 100 : 1;
      blob = await encodeCanvas(canvas, q);
      item.targetMet = null;
    }

    item.processedBlob = blob;
    item.processedWidth = canvas.width;
    item.processedHeight = canvas.height;
    item.status = "Processed";
    if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
    item.processedUrl = URL.createObjectURL(blob);
  }

  async function processSelected() {
    const item = selected();
    if (!item) {
      notify("Add an image first.");
      return;
    }
    if (state.processing) return;

    try {
      state.processing = true;
      els.process.disabled = true;
      els.processAll.disabled = true;
      els.downloadSelected.disabled = true;

      await processItem(item);
      state.previewView = "optimized";
      updatePreviewPanel();
      renderQueue();

      notify(
        item.targetMet === false
          ? "Processed, but the target size could not be reached at minimum quality."
          : "Image processed successfully."
      );
    } catch (err) {
      notify(err.message || "Could not process this image.");
    } finally {
      state.processing = false;
      els.process.disabled = false;
      els.processAll.disabled = false;
      renderQueue();
    }
  }

  async function processAll() {
    if (!state.files.length || state.processing) return;

    state.processing = true;
    els.process.disabled = true;
    els.processAll.disabled = true;
    els.downloadSelected.disabled = true;
    els.downloadAll.disabled = true;

    let done = 0;
    let errors = 0;
    const total = state.files.length;
    setProgress(0, total, "Processing batch…");

    try {
      for (const item of state.files) {
        try {
          item.status = "Processing";
          renderQueue();
          await processItem(item);
        } catch (e) {
          item.status = "Failed";
          item.error = e.message;
          errors++;
        }
        done++;
        setProgress(done, total, `Processed ${done} of ${total}`);
        renderQueue();
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      state.processing = false;
      els.process.disabled = false;
      els.processAll.disabled = false;
      if (selected()?.processedBlob) state.previewView = "optimized";
      updatePreviewPanel();
      renderQueue();
    }

    notify(
      errors
        ? `${total - errors} images processed; ${errors} failed.`
        : `All ${total} images processed.`
    );
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function extensionFor(type) {
    if (type === "image/jpeg") return "jpg";
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/avif") return "avif";
    return "img";
  }

  function downloadSelected() {
    const item = selected();
    if (!item || !item.processedBlob) {
      notify("Process this image before downloading.");
      return;
    }
    downloadBlob(
      item.processedBlob,
      `${safeName(item.file.name)}-resized.${extensionFor(
        item.processedBlob.type
      )}`
    );
  }

  async function downloadZip() {
    const done = state.files.filter((f) => f.processedBlob);
    if (!done.length) {
      notify("Process images before creating a ZIP.");
      return;
    }
    if (typeof JSZip === "undefined") {
      notify("ZIP library did not load. Check your internet connection and retry.");
      return;
    }

    const zip = new JSZip();
    done.forEach((f, i) =>
      zip.file(
        `${String(i + 1).padStart(2, "0")}-${safeName(
          f.file.name
        )}.${extensionFor(f.processedBlob.type)}`,
        f.processedBlob
      )
    );

    try {
      els.downloadAll.disabled = true;
      notify("Creating ZIP archive…");
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 5 }
      });
      downloadBlob(blob, "pro-resizer-export.zip");
      notify(`${done.length} processed images added to ZIP.`);
    } catch (e) {
      notify("Could not create ZIP archive.");
    } finally {
      renderQueue();
    }
  }

  function updateAspect(source) {
    if (!els.lock.checked) return;
    const w = Number(els.width.value);
    const h = Number(els.height.value);
    if (source === "width" && w > 0) {
      els.height.value = Math.max(1, Math.round(w / state.aspect));
    }
    if (source === "height" && h > 0) {
      els.width.value = Math.max(1, Math.round(h * state.aspect));
    }
  }

  function updateQuality() {
    els.qualityValue.textContent = `${els.quality.value}%`;
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pro-resizer-theme", theme);
    $("themeIcon").textContent = theme === "dark" ? "☀" : "☾";
    $("themeLabel").textContent =
      theme === "dark" ? "Light appearance" : "Dark appearance";
    $("themeToggle").querySelector(".theme-state").textContent =
      theme === "dark" ? "ON" : "OFF";
  }

  function bindEvents() {
    els.dropZone.addEventListener("click", () => els.fileInput.click());
    els.dropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.fileInput.click();
      }
    });
    els.addMoreBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (e) => addFiles(e.target.files));

    ["dragenter", "dragover"].forEach((type) =>
      els.dropZone.addEventListener(type, (e) => {
        e.preventDefault();
        els.dropZone.classList.add("dragover");
      })
    );
    els.dropZone.addEventListener("dragleave", () => {
      els.dropZone.classList.remove("dragover");
    });
    els.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.dropZone.classList.remove("dragover");
      addFiles(e.dataTransfer.files);
    });

    // Original vs. Optimized preview toggle.
    els.previewToggle.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        const item = selected();
        if (!item || !item.processedBlob) return;
        state.previewView = btn.dataset.view;
        updatePreviewPanel();
      })
    );

    els.width.addEventListener("input", () => updateAspect("width"));
    els.height.addEventListener("input", () => updateAspect("height"));
    els.lock.addEventListener("change", () => {
      if (els.lock.checked) {
        const w = Number(els.width.value);
        const h = Number(els.height.value);
        if (w > 0 && h > 0) state.aspect = w / h;
      }
    });

    els.preset.addEventListener("change", () => {
      if (els.preset.value === "custom") return;
      const [w, h] = els.preset.value.split("x").map(Number);
      if (w && h) {
        els.width.value = w;
        els.height.value = h;
        state.aspect = w / h;
        els.lock.checked = false;
      }
    });

    document.querySelectorAll("#fitMode button").forEach((b) =>
      b.addEventListener("click", () => {
        state.mode = b.dataset.mode;
        document.querySelectorAll("#fitMode button").forEach((x) => {
          x.classList.toggle("selected", x === b);
        });
      })
    );

    // Live transform controls.
    $("rotateLeft").addEventListener("click", () => {
      state.rotation = (state.rotation - 90) % 360;
      triggerLiveTransformPreview();
    });
    $("rotateRight").addEventListener("click", () => {
      state.rotation = (state.rotation + 90) % 360;
      triggerLiveTransformPreview();
    });
    els.flipH.addEventListener("click", () => {
      state.flipH = !state.flipH;
      triggerLiveTransformPreview();
    });
    els.flipV.addEventListener("click", () => {
      state.flipV = !state.flipV;
      triggerLiveTransformPreview();
    });

    document.querySelectorAll(".crop-input").forEach((input) =>
      input.addEventListener("input", triggerLiveTransformPreview)
    );

    $("resetCrop").addEventListener("click", () => {
      ["cropTop", "cropRight", "cropBottom", "cropLeft"].forEach((id) => {
        $(id).value = 0;
      });
      triggerLiveTransformPreview();
    });

    els.quality.addEventListener("input", updateQuality);
    els.compression.addEventListener("change", () => {
      els.quality.disabled = !els.compression.checked;
    });
    els.target.addEventListener("change", () => {
      els.targetFields.hidden = !els.target.checked;
    });

    els.process.addEventListener("click", processSelected);
    els.downloadSelected.addEventListener("click", downloadSelected);
    els.processAll.addEventListener("click", processAll);
    els.downloadAll.addEventListener("click", downloadZip);

    $("clearAllBtn").addEventListener("click", () => {
      state.files.slice().forEach((f) => removeFile(f.id));
      notify("Workspace cleared.");
    });

    els.themeToggle.addEventListener("click", () =>
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark"
      )
    );

    // Process selected image using Ctrl/Cmd + Enter.
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        processSelected();
      }
    });
  }

  
  function initPointerSpotlight() {
    const spotlight = $("pointerGrid");
    if (!spotlight) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;

    const root = document.documentElement;
    let isVisible = false;

    function showSpotlight() {
      if (!isVisible) {
        spotlight.classList.add("is-visible");
        isVisible = true;
      }
    }

  
    function hideSpotlight() {
      spotlight.classList.remove("is-visible");
      isVisible = false;
    }

    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType === "touch") return;
        root.style.setProperty("--pointer-x", `${event.clientX}px`);
        root.style.setProperty("--pointer-y", `${event.clientY}px`);
        showSpotlight();
      },
      { passive: true }
    );

    window.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget && !event.toElement) hideSpotlight();
    });
    window.addEventListener("blur", hideSpotlight);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hideSpotlight();
    });
  } 

  function init() {
    setTheme(localStorage.getItem("pro-resizer-theme") || "light");
    updateQuality();
    syncTransformButtons();
    bindEvents();
    initPointerSpotlight();
    els.quality.disabled = !els.compression.checked;
    renderQueue();

    window.addEventListener("beforeunload", () =>
      state.files.forEach((f) => {
        URL.revokeObjectURL(f.url);
        if (f.processedUrl) URL.revokeObjectURL(f.processedUrl);
      })
    );
  }

  init();
})();
