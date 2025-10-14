import React from "react";
import ReactDOM from "react-dom";

export default function FileViewer({ fileUrl, fileName, onClose }) {
  const ext = fileName?.split(".").pop().toLowerCase();

  // Decide viewer per file type
  const renderViewer = () => {
  if (ext === "pdf") {
    return <iframe src={fileUrl} title={fileName} className="file-viewer-iframe" />;
  }

  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)) {
    return (
      <iframe
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
        width="100%"
        height="800px"
        frameBorder="0"
        title={fileName}
      />
    );
  }

  if (ext === "txt") {
    return <textarea defaultValue={`Loading ${fileName}...`} className="txt-editor" />;
  }

  return <p>❌ Preview not available for this file type.</p>;
};


  return ReactDOM.createPortal(
    <div className="file-viewer-overlay">
      <div className="file-viewer-header">
        <span>📄 {fileName}</span>
        <button className="close-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="file-viewer-body">{renderViewer()}</div>
    </div>,
    document.body
  );
}
