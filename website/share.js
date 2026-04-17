/**
 * Reusable share button component for Railroaded.
 * Usage: renderShareButtons(containerEl, { url, text, title })
 * Or insert HTML directly: shareButtonsHtml({ url, text, title })
 * Self-contained — injects its own CSS on first use.
 */
(function() {
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '.share-buttons { display: inline-flex; gap: 0.4rem; align-items: center; }' +
      '.share-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border, #2a2a3a); background: var(--bg-card, #12121a); color: var(--text-dim, #8a8780); font-size: 0.85rem; cursor: pointer; transition: border-color 0.2s, color 0.2s; text-decoration: none; padding: 0; font-family: "Cinzel", serif; }' +
      '.share-btn:hover { border-color: var(--gold-dim, #8a7033); color: var(--gold, #c9a84c); }' +
      '.share-btn.copied { border-color: var(--green-light, #4caf50); color: var(--green-light, #4caf50); }' +
      '.share-toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: var(--bg-card, #12121a); border: 1px solid var(--gold-dim, #8a7033); color: var(--gold, #c9a84c); padding: 0.5rem 1.2rem; border-radius: 6px; font-family: "Cinzel", serif; font-size: 0.85rem; z-index: 1000; animation: shareToastFade 2s ease forwards; }' +
      '@keyframes shareToastFade { 0%,70% { opacity: 1; } 100% { opacity: 0; } }';
    document.head.appendChild(style);
  }

  window.shareButtonsHtml = function(opts) {
    injectCSS();
    opts = opts || {};
    var url = encodeURIComponent(opts.url || window.location.href);
    var text = encodeURIComponent(opts.text || document.title);
    var title = encodeURIComponent(opts.title || document.title);
    return '<div class="share-buttons">' +
      '<a href="https://twitter.com/intent/tweet?text=' + text + '&url=' + url + '" target="_blank" rel="noopener noreferrer" class="share-btn share-twitter" title="Share on X/Twitter"><i class="ph ph-x-logo"></i></a>' +
      '<button class="share-btn share-copy" onclick="copyShareLink(this,\'' + opts.url.replace(/'/g, "\\'") + '\')" title="Copy link"><i class="ph ph-link"></i></button>' +
      '<a href="https://reddit.com/submit?url=' + url + '&title=' + title + '" target="_blank" rel="noopener noreferrer" class="share-btn share-reddit" title="Share on Reddit"><i class="ph ph-reddit-logo"></i></a>' +
      '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + url + '" target="_blank" rel="noopener noreferrer" class="share-btn share-linkedin" title="Share on LinkedIn"><i class="ph ph-linkedin-logo"></i></a>' +
    '</div>';
  };

  window.renderShareButtons = function(el, opts) {
    el.innerHTML = shareButtonsHtml(opts || {});
  };

  window.copyShareLink = function(btn, url) {
    navigator.clipboard.writeText(url || window.location.href).then(function() {
      var orig = btn.innerHTML;
      btn.innerHTML = '&#10003;';
      btn.classList.add('copied');
      setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1500);
      var toast = document.createElement('div');
      toast.className = 'share-toast';
      toast.textContent = 'Copied!';
      document.body.appendChild(toast);
      setTimeout(function() { toast.remove(); }, 2200);
    });
  };
})();
