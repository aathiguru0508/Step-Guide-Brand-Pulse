let originalArrayBuffer = null;
let previewTypedArray = null;

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.5.141/pdf.worker.min.js';

const pdfInput = document.getElementById("pdf-upload");
const titleInput = document.getElementById("title-text");
const borderInput = document.getElementById("border-input");
const logoInput = document.getElementById("logo-input");
const finalPdfName = document.getElementById("pdf-name");
const pdfRenderTarget = document.getElementById("pdf-rendered");
const previewButton = document.getElementById("refresh-preview");
const downloadButton = document.getElementById("download-pdf");

pdfInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file || file.type !== "application/pdf") {
    alert("Please select a valid PDF file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    originalArrayBuffer = e.target.result;
    previewTypedArray = new Uint8Array(originalArrayBuffer.slice(0));
    renderPDF(previewTypedArray);
  };
  reader.readAsArrayBuffer(file);
});

previewButton.addEventListener("click", async () => {
  if (!pdfInput.files.length || !logoInput.files.length || !borderInput.files.length) {
    alert("Upload PDF, Logo, and Border first.");
    return;
  }
  const finalBytes = await generateBrandedPDF(false);
  previewTypedArray = new Uint8Array(finalBytes);
  renderPDF(previewTypedArray);
});

downloadButton.addEventListener("click", async () => {
  if (!pdfInput.files.length || !logoInput.files.length || !borderInput.files.length) {
    alert("Upload PDF, Logo, and Border first.");
    return;
  }
  const finalBytes = await generateBrandedPDF(true);
  const blob = new Blob([finalBytes], { type: "application/pdf" });
  const rawName = (finalPdfName.value.trim() +"_"+ titleInput.value.trim()).replace(/\s+/g, "_");
  const fileName = rawName || "Branded_PDF";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `StepGuide_${fileName}.pdf`;
  link.click();
});

async function generateBrandedPDF(shouldDownload = false) {
  const title = titleInput.value || "Branded Title";
  const files = pdfInput.files;
  const logoFile = logoInput.files[0];
  const borderFile = borderInput.files[0];
  const backgroundFile = document.getElementById("background-input").files[0];

  const newPdf = await PDFLib.PDFDocument.create();
  const font = await newPdf.embedFont(PDFLib.StandardFonts.Helvetica);

  const borderBytes = await borderFile.arrayBuffer();
  const logoBytes = await logoFile.arrayBuffer();
  const backgroundBytes = await backgroundFile.arrayBuffer();

  const borderImage = borderFile.type.includes("png")
    ? await newPdf.embedPng(borderBytes)
    : await newPdf.embedJpg(borderBytes);

  const logoImage = logoFile.type.includes("png")
    ? await newPdf.embedPng(logoBytes)
    : await newPdf.embedJpg(logoBytes);

  const backgroundImage = backgroundFile.type.includes("png")
    ? await newPdf.embedPng(backgroundBytes)
    : await newPdf.embedJpg(backgroundBytes);

  // Branding Page (first page)
  const brandingPage = newPdf.addPage([842, 595]);
  const { width, height } = brandingPage.getSize();

  // Add left-side border and logo
  brandingPage.drawImage(borderImage, { x: 0, y: 0, width: 35, height: 595 });
  brandingPage.drawImage(logoImage, { x: 70, y: height - 112, width: 107, height: 59 });

  // Title text wrapping
  const wrapText = (text, maxWidth, font, size) => {
    const words = text.split(" ");
    const lines = [];
    let line = "";

    for (let word of words) {
      const testLine = line + (line ? " " : "") + word;
      const testWidth = font.widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  let currentY = height / 1.9 + 20;
  const wrappedLines = wrapText(title, width - 100, font, 30);
  wrappedLines.forEach((line, i) => {
    brandingPage.drawText(line, {
      x: 70,
      y: currentY - i * 35,
      size: 30,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });
  });

  currentY -= wrappedLines.length * 35;
  brandingPage.drawLine({
    start: { x: 70, y: currentY },
    end: { x: 107, y: currentY },
    thickness: 3.5,
    color: PDFLib.rgb(1, 0.84, 0),
  });

  brandingPage.drawText("Step Guide", {
    x: 70,
    y: currentY - 52,
    size: 16,
    font,
    color: PDFLib.rgb(0, 0, 0),
  });

  // Append uploaded PDF pages
  const mergedPages = [];
  for (let file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const tempPdf = await PDFLib.PDFDocument.load(arrayBuffer);
    const copiedPages = await newPdf.copyPages(tempPdf, tempPdf.getPageIndices());
    mergedPages.push(...copiedPages);
  }

  const totalPages = mergedPages.length + 1;

  for (let i = 0; i < mergedPages.length; i++) {
    const embeddedPage = await newPdf.embedPage(mergedPages[i]);
    const { width: w, height: h } = embeddedPage;
    const addedPage = newPdf.addPage([w, h]);
    // ✅ Step 1: Draw the full-page background image
    addedPage.drawImage(backgroundImage, {
      x: 0,
      y: 0,
      width: w,
      height: h,
      opacity: 0.4, // Optional: Adjust opacity for background
    });
    // ✅ Step 2: Draw the original PDF content over it
    addedPage.drawPage(embeddedPage, {
      x: 0,
      y: 0,
      width: w,
      height: h,
      opacity: 1, // Ensure the original content is fully opaque
    });

    // Footer and page info
    addedPage.drawText(title, {
      x: w - font.widthOfTextAtSize(title, 10) - 30,
      y: h - 43,
      size: 10,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });

    addedPage.drawText("Copyright © 2025, Oracle and/or its affiliates", {
      x: 30,
      y: 30,
      size: 10,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });

    const pageNumText = `${i + 2}/${totalPages}`;
    addedPage.drawText(pageNumText, {
      x: w - font.widthOfTextAtSize(pageNumText, 10) - 30,
      y: 30,
      size: 10,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });
  }

  return await newPdf.save();
}

async function renderPDF(data) {
  const container = document.getElementById("pdf-rendered");
  container.innerHTML = "";

  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 1;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    container.appendChild(canvas);
  }
}

