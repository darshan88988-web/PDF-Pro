/* PDFPro — browser-side PDF utilities.
   Supported operations use PDF-Lib, PDF.js and jsPDF. Files are never posted to a server. */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const MAX_FILE = 100 * 1024 * 1024;

  const tools = [
    ["JPG to PDF","Convert","▧","Turn one or more JPG images into a PDF.","jpgpdf",true],
    ["PNG to PDF","Convert","▧","Create a PDF from PNG images.","pngpdf",true],
    ["PDF to JPG","Convert","▤","Render each PDF page as a JPG image.","pdfjpg",true],
    ["PDF to PNG","Convert","▤","Render PDF pages as high-quality PNG images.","pdfpng",true],
    ["Word to PDF","Convert","W","Extract text from a DOCX and create a simple PDF.","wordpdf",true],
    ["PDF to Word","Convert","W","Extract PDF text into an editable DOCX document.","pdfword",true],
    ["Excel to PDF","Convert","▦","Convert spreadsheet cells to a paginated PDF.","excelpdf",true],
    ["Merge PDF","Organize","⊕","Combine multiple PDF files in your chosen order.","merge",true],
    ["Split PDF","Organize","✂","Split a PDF into one-page PDF files in a ZIP.","split",true],
    ["Extract PDF Pages","Organize","⇥","Save selected pages into a new PDF.","extract",true],
    ["Delete PDF Pages","Organize","−","Remove selected pages from a PDF.","delete",true],
    ["Rearrange PDF Pages","Organize","↕","Set a new order for every page.","reorder",true],
    ["Rotate PDF","Organize","↻","Rotate all pages or selected pages.","rotate",true],
    ["Duplicate PDF Pages","Organize","▣","Duplicate selected pages in sequence.","duplicate",true],
    ["Edit PDF — Add Text","Edit","T","Place custom text on selected pages.","text",true],
    ["Add Image to PDF","Edit","▧","Place an image on selected PDF pages.","addimage",true],
    ["Add Watermark","Edit","◇","Add a text watermark to every page.","watermark",true],
    ["Add Page Numbers","Edit","№","Stamp page numbers on PDF pages.","pagenum",true],
    ["Crop PDF Pages","Edit","□","Crop page boundaries using margins in points.","crop",true],
    ["Compress PDF","Optimize","⇣","Re-save a PDF; file-size reduction depends on the source and is not guaranteed.","compress",true]
  ];

  const state = {
    tool: null,
    files: [],
    resultUrl: null,
    resultName: "PDFPro-result.pdf",
    filter: "All",
    overlayImage: null
  };

  const grid = $("#toolGrid");
  const modal = $("#workspaceModal");
  const input = $("#fileInput");
  const zone = $("#uploadZone");

  const icons = {
    Convert: "↔",
    Organize: "▤",
    Edit: "✎",
    Optimize: "⌁"
  };

  function renderTools() {
    const q = $("#toolSearch").value.trim().toLowerCase();

    const shown = tools.filter(t =>
      (state.filter === "All" || t[1] === state.filter) &&
      (`${t[0]} ${t[3]}`).toLowerCase().includes(q)
    );

    grid.innerHTML = shown.map(t => `
      <article class="tool-card" data-id="${t[4]}" tabindex="0" role="button" aria-label="Open ${t[0]}">
        <span class="tool-tag ready">READY</span>
        <div class="tool-icon">${t[2] || icons[t[1]]}</div>
        <h3>${escapeHtml(t[0])}</h3>
        <p>${escapeHtml(t[3])}</p>
      </article>
    `).join("");

    $("#toolCount").textContent = `${shown.length} ${shown.length === 1 ? "tool" : "tools"}`;
    $("#emptyState").hidden = shown.length !== 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function openTool(id) {
    const t = tools.find(x => x[4] === id);
    if (!t) return;

    state.tool = t;
    clearFiles();

    $("#workspaceCategory").textContent = t[1].toUpperCase() + " TOOL";
    $("#workspaceTitle").textContent = t[0];
    $("#workspaceDescription").textContent = t[3];

    $("#downloadResult").hidden = true;
    $("#statusMessage").textContent = "";
    $("#statusMessage").className = "status-message";
    $("#optionsPanel").innerHTML = optionsFor(id);

    input.accept = acceptFor(id);
    input.multiple = ["jpgpdf", "pngpdf", "merge"].includes(id);

    $("#acceptedTypes").textContent = acceptLabel(id);
    $("#processButton").textContent = "Process";
    $("#processButton").disabled = true;
    $("#uploadZone").style.display = "flex";

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function optionsFor(id) {
    const field = (label, name, placeholder, type = "text", value = "") =>
      `<div class="option-field">
        <label for="opt-${name}">${label}</label>
        <input id="opt-${name}" name="${name}" type="${type}" placeholder="${placeholder}" value="${value}">
      </div>`;

    const select = (label, name, opts) =>
      `<div class="option-field">
        <label for="opt-${name}">${label}</label>
        <select id="opt-${name}" name="${name}">
          ${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}
        </select>
      </div>`;

    const note = s => `<div class="option-note">${s}</div>`;

    if (["jpgpdf", "pngpdf"].includes(id)) {
      return field("Page orientation", "orientation", "portrait", "text", "portrait") +
        select("Image sizing", "fit", [
          ["contain", "Fit image to page"],
          ["fill", "Fill page (may crop)"]
        ]) +
        note("All selected images are placed in the same PDF in the order selected.");
    }

    if (["pdfjpg", "pdfpng"].includes(id)) {
      return field("Render scale", "scale", "2", "number", "2") +
        note("Higher scale gives sharper images but uses more memory. Output pages are bundled into a ZIP.");
    }

    if (id === "merge") {
      return note("Add at least two PDFs. Use the file list order; remove and re-add files to change it.");
    }

    if (id === "split") {
      return note("Each page will be saved as a separate PDF inside a ZIP archive.");
    }

    if (["extract", "delete", "duplicate"].includes(id)) {
      return field("Page numbers", "pages", "Example: 1, 3-5", "text", "") +
        note("Use 1-based page numbers and ranges, for example 1, 3-5. For Delete, the listed pages are removed. For Duplicate, each listed page is copied after its original.");
    }

    if (id === "reorder") {
      return field("New page order", "pages", "Example: 3, 1, 2", "text", "") +
        note("Enter every page number exactly once. Example: 3, 1, 2.");
    }

    if (id === "rotate") {
      return select("Rotation", "degrees", [
        ["90", "90° clockwise"],
        ["180", "180°"],
        ["270", "270° clockwise"]
      ]) + field("Pages (optional)", "pages", "Leave blank for all pages");
    }

    if (["text", "watermark"].includes(id)) {
      return field("Text", "text", "Enter text to place", "text", id === "watermark" ? "CONFIDENTIAL" : "") +
        field("Page numbers (optional)", "pages", "Leave blank for all pages") +
        field("X position (points)", "x", "50", "number", "50") +
        field("Y position (points)", "y", "50", "number", "50") +
        field("Font size", "fontsize", "18", "number", id === "watermark" ? "48" : "18") +
        note("Coordinates are measured from the bottom-left corner. Watermark uses a light diagonal stamp.");
    }

    if (id === "pagenum") {
      return field("Starting number", "start", "1", "number", "1") +
        select("Position", "position", [
          ["bottom-center", "Bottom center"],
          ["bottom-right", "Bottom right"],
          ["top-right", "Top right"]
        ]) +
        field("Font size", "fontsize", "12", "number", "12");
    }

    if (id === "addimage") {
      return field("Pages (optional)", "pages", "Leave blank for all pages") +
        field("X position", "x", "50", "number", "50") +
        field("Y position", "y", "50", "number", "50") +
        field("Width", "width", "150", "number", "150") +
        field("Height", "height", "100", "number", "100") +
        note("After choosing a PDF, select an image file using the additional image picker below.");
    }

    if (id === "crop") {
      return field("Top margin (pt)", "top", "20", "number", "20") +
        field("Right margin (pt)", "right", "20", "number", "20") +
        field("Bottom margin (pt)", "bottom", "20", "number", "20") +
        field("Left margin (pt)", "left", "20", "number", "20") +
        note("Margins are removed from the visible page boundaries. Use 0 to keep an edge unchanged.");
    }

    if (id === "compress") {
      return note("PDFPro re-saves the PDF using object streams. It does not downsample embedded images, so the output may be smaller, similar in size, or occasionally larger.");
    }

    if (id === "wordpdf") {
      return note("This extracts text from a DOCX and places it into a simple PDF. Images, tables, headers, footers and original page layout are not preserved.");
    }

    if (id === "pdfword") {
      return note("This extracts selectable text into a simple editable DOCX. Original layout, images, tables and formatting are not preserved.");
    }

    if (id === "excelpdf") {
      return select("Sheet", "sheet", [["all", "All sheets"]]) +
        note("Spreadsheet values are rendered as text tables. Complex formatting, charts and formulas are not reproduced.");
    }

    return "";
  }

  function acceptFor(id) {
    if (id === "jpgpdf") return "image/jpeg,image/png";
    if (id === "addimage") return "application/pdf,.pdf";
    if (id === "pngpdf") return "image/png";
    if (id === "wordpdf") return ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (id === "excelpdf") return ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if ([
      "pdfjpg", "pdfpng", "pdfword", "merge", "split", "extract",
      "delete", "reorder", "rotate", "duplicate", "text", "watermark",
      "pagenum", "crop", "compress"
    ].includes(id)) return "application/pdf";

    return "*/*";
  }

  function acceptLabel(id) {
    return acceptFor(id).includes("application/pdf")
      ? "PDF files"
      : ["jpgpdf", "addimage"].includes(id)
        ? "JPG or PNG images"
        : id === "pngpdf"
          ? "PNG images"
          : id === "wordpdf"
            ? "DOCX documents"
            : id === "excelpdf"
              ? "Excel workbooks"
              : "Choose supported files";
  }

  function clearFiles() {
    state.files = [];
    state.overlayImage = null;

    renderFiles();
    $("#fileList").innerHTML = "";
    $("#processButton").disabled = true;
    $("#downloadResult").hidden = true;
    $("#statusMessage").textContent = "";
    $("#statusMessage").className = "status-message";
    $("#progressWrap").hidden = true;

    $("#optionsPanel").querySelector("#imageInput")?.remove();
    input.value = "";
  }

  function addFiles(fileList) {
    const id = state.tool?.[4];
    if (!id) return;

    const incoming = [...fileList];

    for (const f of incoming) {
      if (f.size > MAX_FILE) {
        showStatus(`${f.name} is larger than the 100 MB limit.`, true);
        continue;
      }

      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      const valid =
        id === "jpgpdf" ? f.type === "image/jpeg" || /\.jpe?g$/i.test(f.name) :
        id === "pngpdf" ? f.type === "image/png" || /\.png$/i.test(f.name) :
        id === "addimage" ? isPdf || /^image\/(jpeg|png)$/.test(f.type) :
        id === "wordpdf" ? /\.docx$/i.test(f.name) :
        id === "excelpdf" ? /\.(xlsx|xls)$/i.test(f.name) :
        isPdf;

      if (!valid) {
        showStatus(`Unsupported file type: ${f.name}`, true);
        continue;
      }

      if (!input.multiple && state.files.length >= 1 && id !== "addimage") {
        state.files = [];
      }

      if (!state.files.some(x => x.name === f.name && x.size === f.size)) {
        state.files.push(f);
      }
    }

    renderFiles();

    if (
      id === "addimage" &&
      state.files.some(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name)) &&
      !$("#imageInput")
    ) {
      const wrap = document.createElement("div");
      wrap.className = "option-field full";
      wrap.innerHTML = '<label for="imageInput">Image to place</label><input id="imageInput" type="file" accept="image/png,image/jpeg">';
      $("#optionsPanel").append(wrap);

      $("#imageInput").addEventListener("change", e => {
        state.overlayImage = e.target.files[0] || null;
        updateReady();
      });
    }

    updateReady();
  }

  function renderFiles() {
    $("#fileList").innerHTML = state.files.map((f, i) => `
      <div class="file-item">
        <div class="file-type">${escapeHtml((f.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase())}</div>
        <div class="file-info">
          <strong>${escapeHtml(f.name)}</strong>
          <span>${formatSize(f.size)}</span>
        </div>
        <button class="remove-file" data-remove="${i}" aria-label="Remove ${escapeHtml(f.name)}">×</button>
      </div>
    `).join("");
  }

  function formatSize(n) {
    return n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  function updateReady() {
    const id = state.tool?.[4];
    let ready = state.files.length > 0;

    if (id === "merge") ready = state.files.length >= 2;
    if (id === "addimage") {
      ready = state.files.some(f => /\.pdf$/i.test(f.name)) && !!state.overlayImage;
    }

    $("#processButton").disabled = !ready;
  }

  function showStatus(msg, error = false) {
    $("#statusMessage").textContent = msg;
    $("#statusMessage").className = `status-message ${error ? "error" : "success"}`;
  }

  function getOpt(name, def = "") {
    return $(`#opt-${name}`)?.value ?? def;
  }

  function parsePages(raw, total) {
    if (!raw.trim()) return Array.from({ length: total }, (_, i) => i);

    const out = [];

    raw.split(",").forEach(part => {
      const p = part.trim();
      if (!p) return;

      const m = p.match(/^(\d+)\s*-\s*(\d+)$/);

      if (m) {
        let a = +m[1], b = +m[2];
        if (a > b) [a, b] = [b, a];
        for (let n = a; n <= b; n++) out.push(n - 1);
      } else if (/^\d+$/.test(p)) {
        out.push(+p - 1);
      } else {
        throw Error(`Invalid page range: ${p}`);
      }
    });

    if (out.some(n => n < 0 || n >= total)) {
      throw Error(`Page numbers must be between 1 and ${total}.`);
    }

    return [...new Set(out)];
  }

  async function loadPdf(file) {
    return PDFLib.PDFDocument.load(await file.arrayBuffer());
  }

  function progress(msg, p) {
    $("#progressWrap").hidden = false;
    $("#progressText").textContent = msg;
    $("#progressPercent").textContent = `${p}%`;
    $("#progressBar").style.width = `${p}%`;
  }

  function saveBlob(blob, name) {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);

    state.resultUrl = URL.createObjectURL(blob);
    state.resultName = name;

    const a = $("#downloadResult");
    a.href = state.resultUrl;
    a.download = name;
    a.textContent = `↓ Download ${name}`;
    a.hidden = false;
  }

  async function process() {
    const id = state.tool[4];

    $("#processButton").disabled = true;
    $("#downloadResult").hidden = true;
    showStatus("");
    progress("Preparing files…", 8);

    try {
      let blob, name;

      if (["jpgpdf", "pngpdf"].includes(id)) {
        ({ blob, name } = await imagesToPdf(id));
      } else if (id === "pdfjpg" || id === "pdfpng") {
        ({ blob, name } = await pdfToImages(id));
      } else if (id === "merge") {
        ({ blob, name } = await mergePdfs());
      } else if (id === "split") {
        ({ blob, name } = await splitPdf());
      } else if (["extract", "delete", "reorder", "rotate", "duplicate"].includes(id)) {
        ({ blob, name } = await organizePdf(id));
      } else if (["text", "watermark", "pagenum", "crop", "compress", "addimage"].includes(id)) {
        ({ blob, name } = await editPdf(id));
      } else if (id === "wordpdf") {
        ({ blob, name } = await wordToPdf());
      } else if (id === "pdfword") {
        ({ blob, name } = await pdfToWord());
      } else if (id === "excelpdf") {
        ({ blob, name } = await excelToPdf());
      } else {
        throw Error("This operation is not available in this build.");
      }

      progress("Preparing download…", 100);
      saveBlob(blob, name);
      showStatus("Finished. Your file is ready to download.");
    } catch (err) {
      console.error(err);
      showStatus(err.message || "Processing failed. Check the file and try again.", true);
    } finally {
      $("#processButton").disabled = false;
      updateReady();
    }
  }

  async function imagesToPdf(id) {
    const doc = await PDFLib.PDFDocument.create();

    for (let i = 0; i < state.files.length; i++) {
      const f = state.files[i];
      const bytes = await f.arrayBuffer();
      const img = id === "pngpdf" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const size = img.scale(1);

      let pageW = 595.28, pageH = 841.89;

      if (getOpt("orientation", "portrait") === "landscape") {
        [pageW, pageH] = [pageH, pageW];
      }

      const page = doc.addPage([pageW, pageH]);
      const fit = getOpt("fit", "contain");
      const scale = fit === "fill"
        ? Math.max(pageW / size.width, pageH / size.height)
        : Math.min(pageW / size.width, pageH / size.height);

      const w = size.width * scale;
      const h = size.height * scale;

      page.drawImage(img, {
        x: (pageW - w) / 2,
        y: (pageH - h) / 2,
        width: w,
        height: h
      });

      progress("Converting images…", Math.round((i + 1) / state.files.length * 85));
    }

    return {
      blob: new Blob([await doc.save()], { type: "application/pdf" }),
      name: "images-converted.pdf"
    };
  }

  async function pdfToImages(id) {
    const f = state.files[0];
    const data = new Uint8Array(await f.arrayBuffer());
    const task = pdfjsLib.getDocument({ data });
    const pdf = await task.promise;
    const zip = new JSZip();
    const scale = Math.max(.5, Math.min(4, Number(getOpt("scale", "2")) || 2));

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport
      }).promise;

      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, id === "pdfjpg" ? "image/jpeg" : "image/png", .92)
      );

      zip.file(
        `page-${String(n).padStart(3, "0")}.${id === "pdfjpg" ? "jpg" : "png"}`,
        blob
      );

      progress("Rendering PDF pages…", Math.round(n / pdf.numPages * 90));
      canvas.width = canvas.height = 1;
    }

    return {
      blob: await zip.generateAsync({ type: "blob" }),
      name: `${baseName(f.name)}-images.zip`
    };
  }

  async function mergePdfs() {
    const out = await PDFLib.PDFDocument.create();

    for (let i = 0; i < state.files.length; i++) {
      const src = await loadPdf(state.files[i]);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
      progress("Merging PDFs…", Math.round((i + 1) / state.files.length * 85));
    }

    return {
      blob: new Blob([await out.save()], { type: "application/pdf" }),
      name: "merged.pdf"
    };
  }

  async function splitPdf() {
    const src = await loadPdf(state.files[0]);
    const zip = new JSZip();

    for (let i = 0; i < src.getPageCount(); i++) {
      const out = await PDFLib.PDFDocument.create();
      const [p] = await out.copyPages(src, [i]);

      out.addPage(p);
      zip.file(`page-${String(i + 1).padStart(3, "0")}.pdf`, await out.save());

      progress("Splitting pages…", Math.round((i + 1) / src.getPageCount() * 85));
    }

    return {
      blob: await zip.generateAsync({ type: "blob" }),
      name: "split-pages.zip"
    };
  }

  async function organizePdf(id) {
    const src = await loadPdf(state.files[0]);
    const total = src.getPageCount();
    const out = await PDFLib.PDFDocument.create();
    let indices;

    if (id === "extract") indices = parsePages(getOpt("pages"), total);

    if (id === "delete") {
      const remove = new Set(parsePages(getOpt("pages"), total));
      indices = Array.from({ length: total }, (_, i) => i).filter(i => !remove.has(i));

      if (!indices.length) throw Error("You cannot delete every page.");
    }

    if (id === "reorder") {
      indices = parsePages(getOpt("pages"), total);

      if (indices.length !== total || new Set(indices).size !== total) {
        throw Error("Enter every page exactly once to rearrange the PDF.");
      }
    }

    if (id === "duplicate") {
      const dup = parsePages(getOpt("pages"), total);
      indices = [];

      for (let i = 0; i < total; i++) {
        indices.push(i);
        if (dup.includes(i)) indices.push(i);
      }
    }

    if (id === "rotate") {
      indices = Array.from({ length: total }, (_, i) => i);

      if (getOpt("pages").trim()) {
        indices = parsePages(getOpt("pages"), total);
      }
    }

    if (id !== "rotate") {
      const pages = await out.copyPages(src, indices);
      pages.forEach(p => out.addPage(p));
    } else {
      const copied = await out.copyPages(src, Array.from({ length: total }, (_, i) => i));
      copied.forEach(p => out.addPage(p));

      const selected = new Set(indices);
      const deg = Number(getOpt("degrees", "90"));

      out.getPages().forEach((p, i) => {
        if (selected.has(i)) {
          const cur = p.getRotation().angle;
          p.setRotation(PDFLib.degrees((cur + deg) % 360));
        }
      });
    }

    progress("Updating PDF pages…", 85);

    return {
      blob: new Blob([await out.save()], { type: "application/pdf" }),
      name: `${id}-pages.pdf`
    };
  }

  async function editPdf(id) {
    const src = await loadPdf(
      state.files.find(f => /\.pdf$/i.test(f.name)) || state.files[0]
    );

    const pages = src.getPages();

    const selected =
      ["pagenum", "crop", "compress", "addimage"].includes(id)
        ? pages.map((_, i) => i)
        : parsePages(getOpt("pages"), pages.length);

    if (id === "text" || id === "watermark") {
      const text = getOpt("text").trim();

      if (!text) throw Error("Enter the text to add.");

      const size = Math.max(6, Math.min(120, Number(getOpt("fontsize", "18")) || 18));
      const x = Number(getOpt("x", "50")) || 0;
      const y = Number(getOpt("y", "50")) || 0;

      selected.forEach(i => {
        const p = pages[i];
        const { width, height } = p.getSize();

        p.drawText(text, {
          x: Math.max(0, Math.min(x, width - 10)),
          y: Math.max(0, Math.min(y, height - 10)),
          size,
          font: PDFLib.StandardFonts.Helvetica,
          color: PDFLib.rgb(.45, .48, .55),
          opacity: id === "watermark" ? .25 : 1,
          rotate: id === "watermark" ? PDFLib.degrees(35) : PDFLib.degrees(0)
        });
      });
    }

    if (id === "pagenum") {
      const start = Math.max(1, Number(getOpt("start", "1")) || 1);
      const size = Math.max(6, Number(getOpt("fontsize", "12")) || 12);

      pages.forEach((p, i) => {
        const { width } = p.getSize();
        const txt = String(start + i);
        const pos = getOpt("position", "bottom-center");

        let x = width / 2;

        if (pos === "bottom-right" || pos === "top-right") {
          x = width - 45;
        }

        p.drawText(txt, {
          x,
          y: pos === "top-right" ? 25 : 25,
          size,
          font: PDFLib.StandardFonts.Helvetica,
          color: PDFLib.rgb(.25, .28, .35)
        });
      });
    }

    if (id === "crop") {
      const top = +getOpt("top", "20");
      const right = +getOpt("right", "20");
      const bottom = +getOpt("bottom", "20");
      const left = +getOpt("left", "20");

      pages.forEach(p => {
        const { width, height } = p.getSize();

        if (left + right >= width || top + bottom >= height) {
          throw Error("Crop margins are too large for at least one page.");
        }

        p.setCropBox(left, bottom, width - left - right, height - top - bottom);
      });
    }

    if (id === "addimage") {
      const imgFile = state.overlayImage;

      if (!imgFile) throw Error("Choose an image file in the Image to place field.");

      const bytes = await imgFile.arrayBuffer();
      const img = imgFile.type === "image/png"
        ? await src.embedPng(bytes)
        : await src.embedJpg(bytes);

      const x = +getOpt("x", "50");
      const y = +getOpt("y", "50");
      const w = +getOpt("width", "150");
      const h = +getOpt("height", "100");

      pages.forEach(p => p.drawImage(img, { x, y, width: w, height: h }));
    }

    progress("Applying PDF changes…", 80);

    return {
      blob: new Blob([await src.save({ useObjectStreams: true })], { type: "application/pdf" }),
      name: `${id}-${baseName(state.files[0].name)}.pdf`
    };
  }

  async function wordToPdf() {
    if (!window.mammoth || !window.jspdf) {
      throw Error("Required conversion library did not load. Check your internet connection and refresh.");
    }

    const f = state.files[0];
    const res = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const lines = doc.splitTextToSize(res.value || "", 175);

    let y = 18;

    for (const line of lines) {
      if (y > 280) {
        doc.addPage();
        y = 18;
      }

      doc.text(line, 17, y);
      y += 7;
    }

    progress("Creating PDF…", 90);

    return {
      blob: doc.output("blob"),
      name: `${baseName(f.name)}.pdf`
    };
  }

  async function pdfToWord() {
    const f = state.files[0];

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(await f.arrayBuffer())
    }).promise;

    let text = "";

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();

      text += content.items.map(x => x.str).join(" ") + "\n\n";
      progress("Extracting text…", Math.round(n / pdf.numPages * 75));
    }

    const esc = s => s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const paragraphs = text.split(/\n/).map(line =>
      `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`
    ).join("");

    const zip = new JSZip();

    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
    );

    zip.folder("_rels").file(
      ".rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
    );

    zip.folder("word").file(
      "document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>${paragraphs}<w:sectPr/></w:body>
      </w:document>`
    );

    return {
      blob: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      name: `${baseName(f.name)}.docx`
    };
  }

  async function excelToPdf() {
    if (!window.XLSX || !window.jspdf) {
      throw Error("Required conversion library did not load. Check your internet connection and refresh.");
    }

    const f = state.files[0];
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });

    let first = true;

    wb.SheetNames.forEach(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        raw: false
      });

      if (!first) doc.addPage();
      first = false;

      doc.setFontSize(13);
      doc.text(name, 12, 13);

      let y = 22;

      rows.forEach(row => {
        const line = row.map(v => String(v ?? "")).join(" | ");
        const chunks = doc.splitTextToSize(line, 270);

        chunks.forEach(chunk => {
          if (y > 190) {
            doc.addPage();
            y = 15;
          }

          doc.setFontSize(8);
          doc.text(chunk, 12, y);
          y += 5;
        });
      });
    });

    return {
      blob: doc.output("blob"),
      name: `${baseName(f.name)}.pdf`
    };
  }

  function baseName(name) {
    return name
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w-]+/g, "-")
      .slice(0, 70) || "document";
  }

  // Event listeners

  grid.addEventListener("click", e => {
    const card = e.target.closest(".tool-card");
    if (card) openTool(card.dataset.id);
  });

  grid.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("tool-card")) {
      e.preventDefault();
      openTool(e.target.dataset.id);
    }
  });

  $("#filters").addEventListener("click", e => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;

    state.filter = b.dataset.filter;

    document.querySelectorAll(".filter-btn").forEach(x => {
      x.classList.toggle("active", x === b);
    });

    renderTools();
  });

  $("#toolSearch").addEventListener("input", renderTools);

  $("#menuToggle").addEventListener("click", () => {
    const open = $("#navLinks").classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });

  $("#navLinks").addEventListener("click", e => {
    if (e.target.closest("a")) $("#navLinks").classList.remove("open");
  });

  $("#closeModal").addEventListener("click", closeModal);

  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.hidden) closeModal();

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("#toolSearch").focus();
    }
  });

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";

    if (state.resultUrl) {
      URL.revokeObjectURL(state.resultUrl);
      state.resultUrl = null;
    }

    state.overlayImage = null;
  }

  $("#browseButton").addEventListener("click", e => {
    e.stopPropagation();
    input.click();
  });

  zone.addEventListener("click", e => {
    if (e.target.id !== "browseButton") input.click();
  });

  zone.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener("change", e => {
    addFiles(e.target.files);
    input.value = "";
  });

  ["dragenter", "dragover"].forEach(ev => {
    zone.addEventListener(ev, e => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(ev => {
    zone.addEventListener(ev, e => {
      e.preventDefault();
      zone.classList.remove("dragover");
    });
  });

  zone.addEventListener("drop", e => addFiles(e.dataTransfer.files));

  $("#fileList").addEventListener("click", e => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;

    state.files.splice(+b.dataset.remove, 1);
    renderFiles();
    updateReady();
  });

  $("#clearFiles").addEventListener("click", clearFiles);
  $("#processButton").addEventListener("click", process);

  $("#year").textContent = new Date().getFullYear();

  renderTools();
})();