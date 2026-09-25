/* core.js — plumbing every page shares: DOM building, the one modal, the
   one toast, and handing the browser a file to save. */

const Core = (function () {
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "value" && "value" in node) node.value = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => {
      if (c == null || c === false) return;
      // Numbers are coerced rather than rejected. A count is the most natural
      // thing in this app to hand a cell, and letting one bad child throw
      // takes down the whole render above it.
      if (typeof c === "string" || typeof c === "number") {
        node.appendChild(document.createTextNode(String(c)));
        return;
      }
      node.appendChild(c);
    });
    return node;
  }

  // ---------- modal ----------
  // One modal element serves every page; whichever opens it owns the body
  // until it closes. `opts.wide` gives editors with a components table room.
  function openModal(title, renderFn, opts) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal").classList.toggle("wide", !!(opts && opts.wide));
    const body = document.getElementById("modal-body");
    body.innerHTML = "";
    renderFn(body, closeModal);
    document.getElementById("modal-overlay").hidden = false;
    const first = body.querySelector("input:not([type=hidden]), select, textarea");
    if (first && !(opts && opts.noFocus)) setTimeout(() => first.focus(), 30);
  }
  function closeModal() {
    document.getElementById("modal-overlay").hidden = true;
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // Hands the browser a file to save — the order sheets and event sheets,
  // plain text rather than a data export.
  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => false);
    }
    return Promise.resolve(false);
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function init() {
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("modal-overlay").hidden) closeModal();
    });
  }

  return { el, openModal, closeModal, toast, downloadText, copyText, uid, ready, init };
})();
