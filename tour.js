/* ===== Site Tour =====
 * Boarding.js-inspired walkthrough engine. Dims the page with an SVG cutout
 * around a target element and shows a popover with Next / Back / Skip.
 *
 * Usage:
 *   const tour = new SiteTour({
 *     steps: [
 *       { selector: ".brand", title: "Welcome", body: "This is your app." },
 *       { selector: "#settings", title: "Settings", body: "Configure here." },
 *     ],
 *     // Optional hooks:
 *     onBeforeStep: (step) => { if (step.tab) switchTab(step.tab); },
 *     filter: (step) => !step.requiresPerm || hasPerm(step.requiresPerm),
 *     onStart: () => {},
 *     onEnd: () => {},
 *   });
 *   tour.start();
 *
 * A step is: { selector, title, body, ...anyExtraDataForHooks }
 * `body` accepts HTML.
 */
(function (global) {
  "use strict";

  function SiteTour(opts) {
    opts = opts || {};
    this.steps = opts.steps || [];
    this.onBeforeStep = opts.onBeforeStep || null;
    this.onStart = opts.onStart || null;
    this.onEnd = opts.onEnd || null;
    this.filter = opts.filter || null;

    this._active = false;
    this._idx = 0;
    this._filteredSteps = [];
    this._els = null; // { overlay, svg, path, popover, target }

    this._onKeyDown = this._onKeyDown.bind(this);
    this._reposition = this._reposition.bind(this);
  }

  SiteTour.prototype.start = function () {
    if (this._active) return;
    this._active = true;
    this._idx = 0;
    this._filteredSteps = this.filter
      ? this.steps.filter(this.filter)
      : this.steps.slice();
    if (!this._filteredSteps.length) {
      this._active = false;
      return;
    }
    if (this.onStart) { try { this.onStart(); } catch (_) {} }
    this._render();
    window.addEventListener("resize", this._reposition);
    window.addEventListener("scroll", this._reposition, true);
    document.addEventListener("keydown", this._onKeyDown);
  };

  SiteTour.prototype.end = function () {
    if (!this._active) return;
    this._active = false;
    window.removeEventListener("resize", this._reposition);
    window.removeEventListener("scroll", this._reposition, true);
    document.removeEventListener("keydown", this._onKeyDown);
    if (this._els) {
      this._els.overlay.remove();
      this._els.popover.remove();
      this._els = null;
    }
    if (this.onEnd) { try { this.onEnd(); } catch (_) {} }
  };

  SiteTour.prototype.next = function () {
    if (this._idx >= this._filteredSteps.length - 1) { this.end(); return; }
    this._idx++;
    this._render();
  };

  SiteTour.prototype.back = function () {
    if (this._idx <= 0) return;
    this._idx--;
    this._render();
  };

  SiteTour.prototype._onKeyDown = function (e) {
    if (!this._active) return;
    if (e.key === "Escape") this.end();
    else if (e.key === "ArrowRight" || e.key === "Enter") this.next();
    else if (e.key === "ArrowLeft") this.back();
  };

  SiteTour.prototype._render = function () {
    const step = this._filteredSteps[this._idx];
    if (!step) { this.end(); return; }

    if (this.onBeforeStep) {
      try { this.onBeforeStep(step); } catch (_) {}
    }

    if (!this._els) this._buildDom();

    const target = step.selector ? document.querySelector(step.selector) : null;
    this._els.target = target;

    this._els.popover.querySelector(".tour-popover-step").textContent =
      "Step " + (this._idx + 1) + " of " + this._filteredSteps.length;
    this._els.popover.querySelector(".tour-popover-title").textContent = step.title || "";
    this._els.popover.querySelector(".tour-popover-body").innerHTML = step.body || "";
    this._els.popover.querySelector(".tour-btn-back").disabled = this._idx === 0;
    this._els.popover.querySelector(".tour-btn-next").textContent =
      this._idx >= this._filteredSteps.length - 1 ? "Finish" : "Next";

    // If a target was specified but is hidden, skip the step gracefully.
    if (step.selector && (!target || (target.offsetParent === null && target !== document.body))) {
      if (step.skipIfHidden !== false) {
        const self = this;
        // Defer to avoid recursion blowing the stack on a chain of hidden steps.
        setTimeout(function () { self.next(); }, 0);
        return;
      }
    }

    const self = this;
    requestAnimationFrame(function () {
      if (target && target.scrollIntoView) {
        try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
      }
      setTimeout(function () { self._reposition(); }, 80);
    });
  };

  SiteTour.prototype._buildDom = function () {
    const self = this;
    const overlay = document.createElement("div");
    overlay.className = "tour-overlay";
    overlay.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin slice"><path fill="rgb(0,0,0)" fill-opacity="0.72" fill-rule="evenodd"></path></svg>';
    const path = overlay.querySelector("path");
    path.addEventListener("click", function () { self.end(); });
    document.body.appendChild(overlay);

    const popover = document.createElement("div");
    popover.className = "tour-popover";
    popover.innerHTML =
      '<div class="tour-popover-arrow"></div>' +
      '<div class="tour-popover-step"></div>' +
      '<div class="tour-popover-title"></div>' +
      '<div class="tour-popover-body"></div>' +
      '<div class="tour-popover-footer">' +
        '<button type="button" class="tour-btn tour-btn-skip">Skip Tour</button>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="tour-btn tour-btn-back">Back</button>' +
          '<button type="button" class="tour-btn tour-btn-next">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(popover);
    popover.querySelector(".tour-btn-skip").addEventListener("click", function () { self.end(); });
    popover.querySelector(".tour-btn-back").addEventListener("click", function () { self.back(); });
    popover.querySelector(".tour-btn-next").addEventListener("click", function () { self.next(); });

    this._els = { overlay: overlay, svg: overlay.querySelector("svg"), path: path, popover: popover };
  };

  SiteTour.prototype._reposition = function () {
    if (!this._active || !this._els) return;
    const target = this._els.target;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._els.svg.setAttribute("viewBox", "0 0 " + w + " " + h);

    const pad = 8;
    const r = target ? target.getBoundingClientRect() : null;
    if (!r || r.width === 0) {
      this._els.path.setAttribute("d", "M0,0H" + w + "V" + h + "H0Z");
      this._els.popover.style.left = (w / 2 - this._els.popover.offsetWidth / 2) + "px";
      this._els.popover.style.top = (h - this._els.popover.offsetHeight - 40) + "px";
      return;
    }
    const x = Math.max(0, r.left - pad);
    const y = Math.max(0, r.top - pad);
    const cw = Math.min(w - x, r.width + pad * 2);
    const ch = Math.min(h - y, r.height + pad * 2);
    const radius = 8;
    const rr = Math.min(radius, cw / 2, ch / 2);
    this._els.path.setAttribute("d",
      "M0,0H" + w + "V" + h + "H0Z " +
      "M" + (x + rr) + "," + y + " h" + (cw - 2 * rr) +
      " a" + rr + "," + rr + " 0 0 1 " + rr + "," + rr +
      " v" + (ch - 2 * rr) +
      " a" + rr + "," + rr + " 0 0 1 -" + rr + "," + rr +
      " h-" + (cw - 2 * rr) +
      " a" + rr + "," + rr + " 0 0 1 -" + rr + ",-" + rr +
      " v-" + (ch - 2 * rr) +
      " a" + rr + "," + rr + " 0 0 1 " + rr + ",-" + rr + " z"
    );

    const pop = this._els.popover;
    const arrow = pop.querySelector(".tour-popover-arrow");
    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    const gap = 14;
    let left, top, arrowSide = "top";
    if (r.bottom + gap + popH <= h) {
      top = r.bottom + gap;
      left = Math.max(8, Math.min(r.left + r.width / 2 - popW / 2, w - popW - 8));
      arrowSide = "top";
    } else if (r.top - gap - popH >= 0) {
      top = r.top - gap - popH;
      left = Math.max(8, Math.min(r.left + r.width / 2 - popW / 2, w - popW - 8));
      arrowSide = "bottom";
    } else if (r.right + gap + popW <= w) {
      top = Math.max(8, Math.min(r.top + r.height / 2 - popH / 2, h - popH - 8));
      left = r.right + gap;
      arrowSide = "left";
    } else {
      top = Math.max(8, Math.min(r.top + r.height / 2 - popH / 2, h - popH - 8));
      left = Math.max(8, r.left - gap - popW);
      arrowSide = "right";
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    arrow.classList.remove("top", "bottom", "left", "right");
    arrow.classList.add(arrowSide);
    if (arrowSide === "top" || arrowSide === "bottom") {
      const targetCenterX = r.left + r.width / 2;
      const arrowX = Math.max(14, Math.min(targetCenterX - left - 7, popW - 28));
      arrow.style.left = arrowX + "px";
      arrow.style.right = "auto";
      arrow.style.top = arrowSide === "top" ? "-8px" : "";
      arrow.style.bottom = arrowSide === "bottom" ? "-8px" : "";
    } else {
      const targetCenterY = r.top + r.height / 2;
      const arrowY = Math.max(14, Math.min(targetCenterY - top - 7, popH - 28));
      arrow.style.top = arrowY + "px";
      arrow.style.bottom = "auto";
      arrow.style.left = arrowSide === "left" ? "-8px" : "";
      arrow.style.right = arrowSide === "right" ? "-8px" : "";
    }
  };

  // UMD-ish export
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SiteTour;
  } else {
    global.SiteTour = SiteTour;
  }
})(typeof window !== "undefined" ? window : this);
