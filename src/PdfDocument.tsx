import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export function PdfDocument({ url, label }: { url: string; label: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [pageNumber, setPageNumber] = useState(1),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [rendered, setRendered] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setError("");
    setPageNumber(1);
    const task = getDocument({
      url,
      withCredentials: true,
      useSystemFonts: true,
    });
    task.promise
      .then((p) => {
        if (!cancelled) setPdf(p);
      })
      .catch((e) => {
        if (!cancelled) setError(`Could not open this PDF: ${e.message}`);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let renderTask:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendered(false);
    setError("");
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({
            scale: width / page.getViewport({ scale: 1 }).width,
          }),
          ratio = Math.min(devicePixelRatio || 1, 2),
          node = canvas.current!;
        node.width = Math.ceil(viewport.width * ratio);
        node.height = Math.ceil(viewport.height * ratio);
        node.style.width = "100%";
        node.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas: node,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        if (cancelled) return;
        setRendered(true);
        const content = await page.getTextContent();
        if (!cancelled)
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
      } catch (e) {
        if (!cancelled && (e as Error).name !== "RenderingCancelledException")
          setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, width]);
  return (
    <div className="pdf-document" ref={container}>
      {pdf && pdf.numPages > 1 && (
        <nav className="pdf-controls" aria-label="PDF pages">
          <button
            disabled={pageNumber === 1}
            onClick={() => setPageNumber((n) => n - 1)}
          >
            Previous page
          </button>
          <span>
            {pageNumber} / {pdf.numPages}
          </span>
          <button
            disabled={pageNumber === pdf.numPages}
            onClick={() => setPageNumber((n) => n + 1)}
          >
            Next page
          </button>
        </nav>
      )}
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : (
        !rendered && (
          <p className="document-loading" role="status">
            Opening document…
          </p>
        )
      )}
      <canvas
        ref={canvas}
        aria-label={`${label}, page ${pageNumber}`}
        role="img"
        data-rendered={rendered}
      />
      {text && (
        <details className="document-text">
          <summary>Read document as text</summary>
          <p>{text}</p>
        </details>
      )}
    </div>
  );
}
