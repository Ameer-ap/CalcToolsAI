// @ts-nocheck
/*
  CalcTools AI – script.js (Mobile-optimized & fixed)
  - math.js evaluation (no eval)
  - Centralized GTM tracking
  - Deg/Rad toggle with ARIA
  - Input validation: no consecutive ops, no double decimals, implicit × before "("
  - Better errors with fast reset on next input
  - Memory + Ans + localStorage state
  - Scientific functions + safe factorial + nthRoot autoclose
  - Debounced "=" via timestamp
  - Keyboard + touch + paste support
  - JSDoc-ready structure
  - Balanced parentheses check
  - Focus trap for accessibility
  - Localized error messages
  - Fast path for scientific functions
  - Fixed consecutive operator validation (e.g., "2 + * 3" → "Syntax Error")
  - Added dual display: live expression at top, result in main display
  - Added history panel below calculator, auto-expanding with calculations
  - Fixed: Clears display/expression after '=' only on new input
  - Uses Unicode characters in SCI_FUNCS to match HTML button labels
  - MOBILE FIXES: Enhanced touch handling, proper tab switching, passive event listeners
  - Fixed: Tab switching on mobile with proper touch event handling
  - Added: Mobile-specific optimizations and better touch feedback
*/

/* ===== Constants & Regex ===== */
const TOKEN_REGEX = /[0-9+\−×÷^().πen!%⁻¹²³ˣʸ√]|sqrt|nthRoot|sin|cos|tan|log|ln|asin|acos|atan|cbrt|exp|factorial/;
const OP_REGEX = /[+\−×÷^]/;
const CONSECUTIVE_OP_REGEX = /[+\−×÷^]{2,}/; // Detects consecutive operators
const SCI_FUNCS = new Set([
  "sin", "cos", "tan", "sin⁻¹", "cos⁻¹", "tan⁻¹",
  "√x", "x²", "x³", "xʸ", "10ˣ", "eˣ", "ln", "log", "1/x",
  "n!", "ʸ√x", "³√x", "RND", "(", ")"
]);

const MAX_TOKENS = 50;
const MAX_EXPR_LEN = 300;
const ERROR_FLASH_MS = 1200;

/* ===== Mobile Detection ===== */
const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                 ('ontouchstart' in window) || 
                 (navigator.maxTouchPoints > 0);

/* ===== Error Messages ===== */
const ERROR_MESSAGES = {
  en: {
    divideByZero: "Cannot divide by zero",
    syntaxError: "Syntax Error",
    invalidInput: "Invalid input",
    unsupportedType: "Unsupported result type",
    invalidCharacters: "Invalid characters",
    tooComplex: "Expression too complex",
    unbalancedParens: "Unbalanced parentheses"
  }
};

/* ===== Global State ===== */
/**
 * @typedef {Object} CalculatorState
 * @property {number} memory - Memory value for M+/M-/MR.
 * @property {number} ans - Last computed result (Ans).
 * @property {"deg" | "rad"} angleMode - Angle mode for trigonometric functions.
 * @property {boolean} isError - Tracks error state.
 * @property {string} lastExpression - Last evaluated expression (normalized).
 * @property {boolean} isAfterEqual - Flag to indicate post-'=' state.
 */
const calculatorState = {
  memory: 0,
  ans: 0,
  angleMode: "deg",
  isError: false,
  lastExpression: "",
  isAfterEqual: false
};

let isCalculating = false;
let lastCalcTs = 0;
let lastTouchTime = 0; // For mobile tap debouncing

/* ===== Utilities ===== */
/**
 * Tracks events via GTM.
 * @param {string} event - Event name.
 * @param {Object} data - Event data.
 */
function trackEvent(event, data = {}) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push({ event, ...data });
  }
}

/**
 * Checks if a value is a finite number.
 * @param {any} x
 * @returns {boolean}
 */
function isFiniteNumber(x) {
  return typeof x === "number" && isFinite(x);
}

/**
 * Converts degrees to radians based on angle mode.
 * @param {number} v
 * @returns {number}
 */
function toRadians(v) {
  return calculatorState.angleMode === "deg" ? (v * Math.PI) / 180 : v;
}

/**
 * Converts radians to degrees based on angle mode.
 * @param {number} rad
 * @returns {number}
 */
function fromRadians(rad) {
  return calculatorState.angleMode === "deg" ? (rad * 180) / Math.PI : rad;
}

/**
 * Rounds a number to 10 decimal places and snaps tiny values to 0.
 * @param {number} n
 * @returns {number}
 */
function roundDisplay(n) {
  if (typeof n !== "number") return n;
  if (Math.abs(n) < 1e-10) return 0;
  return Number(parseFloat(n.toFixed(10)));
}

/**
 * Shows an error message with ARIA support.
 * @param {HTMLInputElement} display
 * @param {string} msgKey - Error message key.
 */
function showError(display, msgKey) {
  const msg = ERROR_MESSAGES.en[msgKey] || msgKey;
  display.value = msg;
  display.classList.add("error");
  const errorRegion = document.querySelector(".error-region");
  if (errorRegion) errorRegion.textContent = msg;
  
  setTimeout(() => {
    display.classList.remove("error");
    if (errorRegion) errorRegion.textContent = "";
  }, ERROR_FLASH_MS);
  
  calculatorState.isError = true;
  trackEvent("calculator_error", { error_message: msg, is_mobile: isMobile });
}

/**
 * Persists state to localStorage.
 */
function saveState() {
  try {
    localStorage.setItem("calculatorState", JSON.stringify(calculatorState));
  } catch (e) { 
    console.warn("Failed to save calculator state:", e);
  }
}

/**
 * Loads state from localStorage.
 */
function loadState() {
  try {
    const savedState = localStorage.getItem("calculatorState");
    if (savedState) {
      const parsedState = JSON.parse(savedState);
      Object.assign(calculatorState, parsedState);
      return true;
    }
  } catch (e) {
    console.warn("Failed to load calculator state:", e);
  }
  return false;
}

/* ===== Mobile Touch Handling ===== */
/**
 * Prevents double-tap zoom on buttons while maintaining accessibility
 * @param {HTMLElement} element 
 */
function preventDoubleTabZoom(element) {
  let lastTouchEnd = 0;
  element.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}

/**
 * Adds haptic feedback on mobile devices
 */
function addHapticFeedback() {
  if ('vibrate' in navigator && isMobile) {
    navigator.vibrate(10); // Very subtle vibration
  }
}

/* ===== Init ===== */
/**
 * Initializes the calculator with mobile optimizations.
 */
function initCalculator() {
  // Load state from localStorage
  const stateLoaded = loadState();
  
  if (stateLoaded) {
    const modeButtons = document.querySelectorAll("#sci-panel .mode");
    modeButtons.forEach(m => {
      const isActive = m.dataset.mode === calculatorState.angleMode;
      m.classList.toggle("active", isActive);
      m.setAttribute("aria-pressed", String(isActive));
    });
  }

  // Remove noscript
  const noscript = document.querySelector("noscript");
  if (noscript) noscript.remove();

  const tabbar = document.getElementById("tabbar");
  const calcWrap = document.querySelector(".calc-wrap");
  const panels = {
    "basic-panel": document.getElementById("basic-panel"),
    "sci-panel": document.getElementById("sci-panel")
  };

  // Check if required elements exist
  if (!tabbar || !calcWrap || !panels["basic-panel"] || !panels["sci-panel"]) {
    console.error("Required calculator elements not found");
    return;
  }

  // Prevent double-tap zoom on calculator buttons
  if (isMobile) {
    preventDoubleTabZoom(calcWrap);
    preventDoubleTabZoom(tabbar);
  }

  /* Enhanced Tab Switching - Mobile Optimized */
  function handleTabInteraction(e) {
    e.preventDefault();
    const tab = e.target.closest(".tab");
    if (!tab) return;
    
    const now = Date.now();
    if (isMobile && now - lastTouchTime < 300) {
      return; // Debounce rapid taps
    }
    lastTouchTime = now;
    
    // Add haptic feedback on mobile
    if (isMobile) addHapticFeedback();
    
    activateTab(tab, panels);
    trackEvent("tab_switch", { 
      tab: tab.dataset.target, 
      is_mobile: isMobile,
      interaction_type: e.type 
    });
  }

  // Tab switching - multiple event types for better mobile support
  tabbar.addEventListener("click", handleTabInteraction);
  
  if (isMobile) {
    // Enhanced touch handling for mobile
    tabbar.addEventListener("touchstart", function(e) {
      const tab = e.target.closest(".tab");
      if (tab) {
        tab.classList.add("touch-active");
      }
    }, { passive: true });
    
    tabbar.addEventListener("touchend", function(e) {
      e.preventDefault();
      const tab = e.target.closest(".tab");
      if (tab) {
        tab.classList.remove("touch-active");
        handleTabInteraction(e);
      }
    }, { passive: false });
    
    tabbar.addEventListener("touchcancel", function(e) {
      const tab = e.target.closest(".tab");
      if (tab) {
        tab.classList.remove("touch-active");
      }
    }, { passive: true });
  }

  /* Tabs (keyboard) */
  tabbar.addEventListener("keydown", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    const tabs = [...tabbar.querySelectorAll(".tab")];
    const idx = tabs.indexOf(tab);

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        tabs[(idx + 1) % tabs.length].focus();
        break;
      case "ArrowLeft":
        e.preventDefault();
        tabs[(idx - 1 + tabs.length) % tabs.length].focus();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activateTab(tab, panels);
        trackEvent("tab_switch", { 
          tab: tab.dataset.target, 
          interaction_type: "keyboard" 
        });
        break;
    }
  });

  /* Enhanced Button Event Handling - Mobile Optimized */
  function handleButtonInteraction(e) {
    const button = e.target.closest("button");
    if (!button) return;
    
    const now = Date.now();
    if (isMobile && e.type === 'touchend' && now - lastTouchTime < 100) {
      return; // Prevent double firing
    }
    
    if (e.type === 'touchend') {
      e.preventDefault();
      lastTouchTime = now;
      if (isMobile) addHapticFeedback();
    }

    if (button.classList.contains("mode")) {
      setAngleMode(button);
      return;
    }

    const panel = button.closest(".panel");
    if (!panel) return;
    
    const display = panel.querySelector(".display");
    const expressionDiv = panel.querySelector(".expression");
    const historyDiv = panel.querySelector(".history");
    
    if (!display || !expressionDiv) return;
    
    const buttonText = button.textContent.trim();
    const dataOp = button.dataset.op || null;

    handleButtonPress(buttonText, dataOp, display, expressionDiv, historyDiv);
  }

  // Button event handling
  calcWrap.addEventListener("click", handleButtonInteraction);
  
  if (isMobile) {
    calcWrap.addEventListener("touchstart", function(e) {
      const button = e.target.closest("button");
      if (button && !button.classList.contains("mode")) {
        button.classList.add("touch-active");
      }
    }, { passive: true });
    
    calcWrap.addEventListener("touchend", handleButtonInteraction, { passive: false });
    
    calcWrap.addEventListener("touchcancel", function(e) {
      const button = e.target.closest("button");
      if (button) {
        button.classList.remove("touch-active");
      }
    }, { passive: true });
  } else {
    // Desktop-only touch handling for better compatibility
    calcWrap.addEventListener("touchend", e => {
      e.preventDefault();
      handleButtonInteraction(e);
    }, { passive: false });
  }

  /* Keyboard: scope to displays */
  document.querySelectorAll(".display").forEach(display => {
    display.addEventListener("keydown", handleKeyboardInput);
    display.addEventListener("paste", e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const sanitized = text.split("").filter(c => TOKEN_REGEX.test(c)).join("");
      
      if (sanitized.length > MAX_EXPR_LEN) {
        showError(display, "tooComplex");
        return;
      }
      
      if (CONSECUTIVE_OP_REGEX.test(sanitized)) {
        showError(display, "syntaxError");
        return;
      }
      
      const expressionDiv = display.closest(".panel").querySelector(".expression");
      if (expressionDiv) {
        expressionDiv.textContent = sanitized;
        updateDisplay(display, expressionDiv);
      }
    });
  });

  /* Keyboard: Deg/Rad buttons */
  calcWrap.addEventListener("keydown", e => {
    const btn = e.target.closest("button.mode");
    if (!btn) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      btn.click();
    }
  });
  
  // Initialize first tab as active if none are active
  const activeTabs = tabbar.querySelectorAll(".tab.active");
  if (activeTabs.length === 0) {
    const firstTab = tabbar.querySelector(".tab");
    if (firstTab) {
      activateTab(firstTab, panels);
    }
  }
}

/**
 * Handles button events (click/touch).
 * @param {Event} e
 * @param {Object.<string, HTMLElement>} panels
 */
function handleButtonEvent(e, panels) {
  const button = e.target.closest("button");
  if (!button) return;

  if (button.classList.contains("mode")) {
    setAngleMode(button);
    return;
  }

  const panel = button.closest(".panel");
  if (!panel) return;
  
  const display = panel.querySelector(".display");
  const expressionDiv = panel.querySelector(".expression");
  const historyDiv = panel.querySelector(".history");
  
  if (!display || !expressionDiv) return;
  
  const buttonText = button.textContent.trim();
  const dataOp = button.dataset.op || null;

  handleButtonPress(buttonText, dataOp, display, expressionDiv, historyDiv);
}

/**
 * Activates a tab with focus trap and mobile optimizations.
 * @param {HTMLElement} tab
 * @param {Object.<string, HTMLElement>} panels
 */
function activateTab(tab, panels) {
  const target = tab.dataset.target;
  
  // Remove active state from all tabs
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
    t.setAttribute("tabindex", "-1");
  });
  
  // Set active tab
  tab.classList.add("active");
  tab.setAttribute("aria-selected", "true");
  tab.setAttribute("tabindex", "0");

  // Hide all panels
  Object.values(panels).forEach(p => {
    if (p) {
      p.classList.remove("active");
      p.setAttribute("hidden", "");
      if (p.trapFocus) {
        p.removeEventListener("keydown", p.trapFocus);
      }
    }
  });
  
  // Show active panel
  const activePanel = panels[target];
  if (!activePanel) return;
  
  activePanel.classList.add("active");
  activePanel.removeAttribute("hidden");

  // Focus management - only if not on mobile or if keyboard navigation
  if (!isMobile) {
    // Focus trap for desktop
    const focusable = activePanel.querySelectorAll("button:not([disabled]), input:not([disabled])");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    function trapFocus(e) {
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    
    activePanel.trapFocus = trapFocus;
    activePanel.addEventListener("keydown", trapFocus);

    // Focus display on desktop
    const displayInput = activePanel.querySelector(".display");
    if (displayInput) {
      setTimeout(() => displayInput.focus(), 50);
    }
  }
  
  // Ensure viewport is adjusted on mobile
  if (isMobile) {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }
}

/**
 * Sets the angle mode (Deg/Rad) with mobile optimizations.
 * @param {HTMLElement} button
 */
function setAngleMode(button) {
  const mode = button.dataset.mode; // "deg" | "rad"
  if (!mode) return;
  
  calculatorState.angleMode = mode;
  saveState();

  const modeBtns = document.querySelectorAll("#sci-panel .mode");
  modeBtns.forEach(m => {
    const isActive = m === button;
    m.classList.toggle("active", isActive);
    m.setAttribute("aria-pressed", String(isActive));
  });
  
  trackEvent("angle_mode_change", { 
    mode: mode, 
    is_mobile: isMobile 
  });
}

/**
 * Handles keyboard input.
 * @param {KeyboardEvent} e
 */
function handleKeyboardInput(e) {
  const display = e.target;
  const key = e.key;

  const keyMap = {
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
    "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    ".": ".", "+": "+", "-": "−", "*": "×", "/": "÷",
    "Enter": "=", "=": "=", "Escape": "AC", "Backspace": "Back",
    "%": "%", "p": "π", "P": "π", "e": "e", "E": "e",
    "s": "sin", "c": "cos", "t": "tan", "l": "log", "n": "ln",
    "(": "(", ")": ")", "^": "xʸ"
  };

  if (keyMap[key]) {
    e.preventDefault();
    const token = keyMap[key];
    const panel = display.closest(".panel");
    if (!panel) return;
    
    const expressionDiv = panel.querySelector(".expression");
    const historyDiv = panel.querySelector(".history");
    
    if (!expressionDiv) return;
    
    let dataOp = null;
    if (token === "÷") dataOp = "divide";
    else if (token === "×") dataOp = "multiply";
    
    handleButtonPress(token, dataOp, display, expressionDiv, historyDiv);
  }
}

/**
 * Handles button presses with enhanced mobile feedback.
 * @param {string} buttonText
 * @param {string | null} dataOp
 * @param {HTMLInputElement} display
 * @param {HTMLElement} expressionDiv
 * @param {HTMLElement} historyDiv
 */
function handleButtonPress(buttonText, dataOp, display, expressionDiv, historyDiv) {
  // Clear error state on new input (except AC)
  if (calculatorState.isError && !["AC"].includes(buttonText)) {
    display.value = "0";
    expressionDiv.textContent = "";
    calculatorState.isError = false;
    calculatorState.isAfterEqual = false;
  }

  trackEvent("calculator_action", {
    action: buttonText,
    calculator_type: display.id === "sci-display" ? "scientific" : "basic",
    is_mobile: isMobile
  });

  switch (buttonText) {
    case "AC": {
      display.value = "0";
      expressionDiv.textContent = "";
      if (historyDiv) historyDiv.innerHTML = "";
      calculatorState.lastExpression = "";
      calculatorState.isError = false;
      calculatorState.isAfterEqual = false;
      // Don't reset memory and ans on AC - keep them for session
      saveState();
      return;
    }
    
    case "Back": {
      let expr = expressionDiv.textContent;
      if (expr.length > 0) {
        expr = expr.slice(0, -1);
        expressionDiv.textContent = expr;
        updateDisplay(display, expressionDiv);
      }
      return;
    }
    
    case "±": {
      let expr = expressionDiv.textContent;
      if (expr.startsWith("-")) {
        expressionDiv.textContent = expr.slice(1);
      } else if (expr && expr !== "0") {
        expressionDiv.textContent = `-${expr}`;
      }
      updateDisplay(display, expressionDiv);
      return;
    }
    
    case "Ans": {
      appendToken(display, String(calculatorState.ans), expressionDiv);
      return;
    }
    
    case "M+": {
      const currentValue = parseFloat(display.value) || 0;
      calculatorState.memory += currentValue;
      saveState();
      return;
    }
    
    case "M-": {
      const currentValue = parseFloat(display.value) || 0;
      calculatorState.memory -= currentValue;
      saveState();
      return;
    }
    
    case "MR": {
      if (calculatorState.isAfterEqual) {
        expressionDiv.textContent = "";
        calculatorState.isAfterEqual = false;
      }
      display.value = String(calculatorState.memory);
      expressionDiv.textContent = String(calculatorState.memory);
      return;
    }
    
    case "E": {
      appendToken(display, "e", expressionDiv);
      return;
    }
    
    case "=": {
      calculateResult(display, expressionDiv, historyDiv);
      return;
    }
    
    case "%": {
      handlePercentage(display, expressionDiv);
      return;
    }
    
    case "π":
    case "e": {
      handleConstants(buttonText, display, expressionDiv);
      return;
    }
    
    default: {
      if (SCI_FUNCS.has(buttonText)) {
        handleScientificButton(buttonText, display, expressionDiv);
        return;
      }
      
      // Handle regular input (numbers, operators, parentheses)
      if (dataOp || /[0-9.]|\+|\−|\×|\÷|\^|\(|\)/.test(buttonText)) {
        if (calculatorState.isAfterEqual) {
          expressionDiv.textContent = "";
          display.value = "0";
          calculatorState.isAfterEqual = false;
        }
        appendToken(display, buttonText, expressionDiv);
        updateDisplay(display, expressionDiv);
        calculatorState.isError = false;
      }
    }
  }
}

/**
 * Handles percentage calculations.
 * @param {HTMLInputElement} display
 * @param {HTMLElement} expressionDiv
 */
function handlePercentage(display, expressionDiv) {
  try {
    const expr = expressionDiv.textContent;
    const lastNumMatch = expr.match(/([-+]?[0-9]*\.?[0-9]+)$/);
    
    if (lastNumMatch) {
      const lastNum = lastNumMatch[0];
      const percentVal = parseFloat(lastNum) / 100;
      
      if (!isFiniteNumber(percentVal)) {
        throw new Error("invalidInput");
      }
      
      const newExpr = expr.substring(0, expr.length - lastNum.length) + percentVal;
      expressionDiv.textContent = newExpr;
      updateDisplay(display, expressionDiv);
    } else {
      // If no number found, just append % symbol
      appendToken(display, "%", expressionDiv);
    }
  } catch (err) {
    showError(display, "invalidInput");
  }
}

/**
 * Handles constants (π, e).
 * @param {string} constant
 * @param {HTMLInputElement} display
 * @param {HTMLElement} expressionDiv
 */
function handleConstants(constant, display, expressionDiv) {
  const value = constant === "π" ? "π" : "e";
  
  if (calculatorState.isError) {
    expressionDiv.textContent = value;
    updateDisplay(display, expressionDiv);
    calculatorState.isError = false;
  } else {
    if (calculatorState.isAfterEqual) {
      expressionDiv.textContent = "";
      calculatorState.isAfterEqual = false;
    }
    appendToken(display, value, expressionDiv);
  }
}

/**
 * Handles scientific buttons with immediate evaluation for simple cases.
 * @param {string} func
 * @param {HTMLInputElement} display
 * @param {HTMLElement} expressionDiv
 */
function handleScientificButton(func, display, expressionDiv) {
  const raw = expressionDiv.textContent;
  const value = parseFloat(raw) || 0;

  try {
    const immediateEval = {
      "sin": () => roundDisplay(Math.sin(toRadians(value))),
      "cos": () => roundDisplay(Math.cos(toRadians(value))),
      "tan": () => roundDisplay(Math.tan(toRadians(value))),
      "sin⁻¹": () => {
        if (value < -1 || value > 1) throw new Error("invalidInput");
        return roundDisplay(fromRadians(Math.asin(value)));
      },
      "cos⁻¹": () => {
        if (value < -1 || value > 1) throw new Error("invalidInput");
        return roundDisplay(fromRadians(Math.acos(value)));
      },
      "tan⁻¹": () => roundDisplay(fromRadians(Math.atan(value))),
      "√x": () => {
        if (value < 0) throw new Error("invalidInput");
        return roundDisplay(Math.sqrt(value));
      },
      "x²": () => roundDisplay(Math.pow(value, 2)),
      "x³": () => roundDisplay(Math.pow(value, 3)),
      "10ˣ": () => roundDisplay(Math.pow(10, value)),
      "eˣ": () => roundDisplay(Math.exp(value)),
      "ln": () => {
        if (value <= 0) throw new Error("invalidInput");
        return roundDisplay(Math.log(value));
      },
      "log": () => {
        if (value <= 0) throw new Error("invalidInput");
        return roundDisplay(Math.log10(value));
      },
      "1/x": () => {
        if (value === 0) throw new Error("divideByZero");
        return roundDisplay(1 / value);
      },
      "n!": () => {
        const f = factorial(value);
        if (!isFiniteNumber(f)) throw new Error("invalidInput");
        return f;
      },
      "³√x": () => roundDisplay(Math.cbrt(value)),
      "RND": () => roundDisplay(Math.random())
    };

    // Fast path for single number evaluation
    if (/^\d*\.?\d*$/.test(raw) && raw !== "") {
      if (func in immediateEval) {
        const result = immediateEval[func]();
        if (!isFiniteNumber(result)) {
          if (result === Infinity || result === -Infinity) {
            throw new Error("divideByZero");
          }
          throw new Error("invalidInput");
        }
        
        expressionDiv.textContent = `${func}(${value})`;
        display.value = String(result);
        calculatorState.ans = result;
        calculatorState.isAfterEqual = true;
        saveState();
        return;
      }
    }

    // Handle special cases
    if (func === "(" || func === ")") {
      appendToken(display, func, expressionDiv);
      return;
    }

    if (func === "xʸ") {
      appendToken(display, "^", expressionDiv);
      return;
    }

          if (func === "ʸ√x") {
      if (/^\d*\.?\d*$/.test(raw) && raw !== "") {
        expressionDiv.textContent = `nthRoot(${raw},`;
        display.value = `nthRoot(${raw},`;
      } else {
        appendToken(display, "nthRoot(", expressionDiv);
      }
      return;
    }

    // For functions that can be evaluated immediately
    if (func in immediateEval && raw) {
      const result = immediateEval[func]();
      if (!isFiniteNumber(result)) {
        if (result === Infinity || result === -Infinity) {
          throw new Error("divideByZero");
        }
        throw new Error("invalidInput");
      }
      
      expressionDiv.textContent = `${func}(${value})`;
      display.value = String(result);
      calculatorState.ans = result;
      calculatorState.isAfterEqual = true;
      saveState();
      return;
    }

    // Default: append function to expression
    appendToken(display, func + "(", expressionDiv);
    
  } catch (err) {
    const errorKey = err.message && ERROR_MESSAGES.en[err.message] ? err.message : "invalidInput";
    showError(display, errorKey);
  }
}

/**
 * Appends a token with validation.
 * @param {HTMLInputElement} display
 * @param {string} token
 * @param {HTMLElement} expressionDiv
 */
function appendToken(display, token, expressionDiv) {
  if (!TOKEN_REGEX.test(token)) return;
  if (expressionDiv.textContent.length >= MAX_EXPR_LEN) return;

  const currentExpr = expressionDiv.textContent;
  const lastChar = currentExpr.slice(-1);

  // Handle decimal point validation
  if (token === ".") {
    const segments = currentExpr.split(/[+\−×÷^()]/);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment.includes(".")) return; // Already has decimal
  }

  // Block consecutive operators (except unary minus)
  if (OP_REGEX.test(token)) {
    if (OP_REGEX.test(lastChar)) {
      // Allow unary minus after operators or at start
      if (!(token === "−" && (lastChar === "(" || currentExpr === "" || currentExpr === "0"))) {
        showError(display, "syntaxError");
        return;
      }
    }
  }

  // Implicit multiplication before functions, constants, or opening parenthesis
  const needsMultiplication = (
    (token === "(" || token === "π" || token === "e" || SCI_FUNCS.has(token)) && 
    /[0-9πe)]$/.test(lastChar)
  );

  if (needsMultiplication) {
    expressionDiv.textContent += "×" + token;
  } else {
    // Replace "0" if starting fresh with a number or constant
    const shouldReplaceZero = currentExpr === "0" && /[0-9.(πe]/.test(token);
    expressionDiv.textContent = shouldReplaceZero ? token : currentExpr + token;
  }

  updateDisplay(display, expressionDiv);
}

/**
 * Updates the display with the current expression result.
 * @param {HTMLInputElement} display
 * @param {HTMLElement} expressionDiv
 */
function updateDisplay(display, expressionDiv) {
  try {
    let expr = expressionDiv.textContent;
    if (!expr || expr === "0") {
      display.value = "0";
      return;
    }

    // Replace Ans with its value
    expr = expr.replace(/\bAns\b/g, String(calculatorState.ans));
    
    // Normalize for evaluation
    const normalized = normalizeForEvaluate(expr);
    const result = math.evaluate(normalized);
    
    if (isFiniteNumber(result)) {
      display.value = String(roundDisplay(result));
    } else {
      display.value = expr; // Show expression if evaluation fails
    }
  } catch (e) {
    // Silently fall back to showing current input
    display.value = expressionDiv.textContent || "0";
  }
}

/**
 * Evaluates the expression with comprehensive validation.
 * @param {HTMLInputElement} display
 * @param {HTMLElement} expressionDiv
 * @param {HTMLElement|null} historyDiv
 */
function calculateResult(display, expressionDiv, historyDiv) {
  const now = Date.now();
  if (now - lastCalcTs < 250) return; // Debounce
  lastCalcTs = now;

  if (isCalculating) return;

  const expr = expressionDiv.textContent.trim();
  if (!expr) return;

  // Parentheses balance check
  const openParens = (expr.match(/\(/g) || []).length;
  const closeParens = (expr.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    showError(display, "unbalancedParens");
    return;
  }

  // Consecutive operator check
  if (CONSECUTIVE_OP_REGEX.test(expr)) {
    showError(display, "syntaxError");
    return;
  }

  // Complexity check
  if (expr.length > MAX_EXPR_LEN) {
    showError(display, "tooComplex");
    return;
  }

  isCalculating = true;
  try {
    let normalizedExpr = expr;
    
    // Replace Ans with its value
    normalizedExpr = normalizedExpr.replace(/\bAns\b/g, String(calculatorState.ans));
    
    // Normalize for math.js evaluation
    normalizedExpr = normalizeForEvaluate(normalizedExpr);

    const result = math.evaluate(normalizedExpr);

    let numResult;
    if (typeof result === "number") {
      numResult = result;
    } else if (result && typeof result.toNumber === "function") {
      numResult = result.toNumber();
    } else if (result && typeof result.re === "number" && typeof result.im === "number") {
      // Complex number - take real part if imaginary is negligible
      if (Math.abs(result.im) < 1e-10) {
        numResult = result.re;
      } else {
        throw new Error("unsupportedType");
      }
    } else {
      throw new Error("unsupportedType");
    }

    if (!isFiniteNumber(numResult)) {
      if (numResult === Infinity || numResult === -Infinity) {
        throw new Error("divideByZero");
      }
      throw new Error("invalidInput");
    }

    const rounded = roundDisplay(numResult);
    calculatorState.ans = rounded;
    calculatorState.lastExpression = normalizedExpr;
    
    // Update display and expression
    const originalExpr = expressionDiv.textContent;
    expressionDiv.textContent = `${originalExpr} = ${rounded}`;
    display.value = String(rounded);
    
    calculatorState.isError = false;
    calculatorState.isAfterEqual = true;
    saveState();

    // Add to history if available
    if (historyDiv) {
      const historyEntry = document.createElement("p");
      historyEntry.textContent = expressionDiv.textContent;
      historyDiv.appendChild(historyEntry);
      historyDiv.scrollTop = historyDiv.scrollHeight;
    }

    // Track calculation completion
    trackEvent("calculation_completed", {
      expression: originalExpr,
      result: rounded,
      is_mobile: isMobile
    });

  } catch (err) {
    let errorKey = "syntaxError";
    if (err && err.message && ERROR_MESSAGES.en[err.message]) {
      errorKey = err.message;
    } else if (err && typeof err.message === "string") {
      // Handle math.js specific errors
      const msg = err.message.toLowerCase();
      if (msg.includes("divide") || msg.includes("division")) {
        errorKey = "divideByZero";
      } else if (msg.includes("undefined") || msg.includes("invalid")) {
        errorKey = "invalidInput";
      }
    }
    showError(display, errorKey);
  } finally {
    isCalculating = false;
  }
}

/**
 * Normalizes UI tokens to math.js syntax.
 * @param {string} expr
 * @returns {string}
 */
function normalizeForEvaluate(expr) {
  // Check for invalid characters first
  if (/[^0-9+\−×÷^()πe\s,.a-z⁻¹²³ˣʸ√!%]/i.test(expr)) {
    throw new Error("invalidCharacters");
  }

  let normalized = expr
    // Replace UI symbols with math.js equivalents
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    
    // Handle scientific functions
    .replace(/√x/g, "sqrt")
    .replace(/x²/g, "^2")
    .replace(/x³/g, "^3")
    .replace(/xʸ/g, "^")
    .replace(/10ˣ/g, "10^")
    .replace(/eˣ/g, "exp")
    .replace(/³√x/g, "cbrt")
    
    // Handle inverse trig functions
    .replace(/sin⁻¹/g, "asin")
    .replace(/cos⁻¹/g, "acos")
    .replace(/tan⁻¹/g, "atan")
    
    // Handle other functions
    .replace(/1\/x/g, "1/")
    .replace(/n!/g, "factorial")
    .replace(/ʸ√x/g, "nthRoot")
    
    // Handle percentage as division by 100
    .replace(/([0-9.]+)%/g, "($1/100)")
    
    // Add implicit multiplication before functions and constants
    .replace(/(\d|\)|pi|e)(?=(sin|cos|tan|asin|acos|atan|log|ln|sqrt|nthRoot|cbrt|exp|factorial)\b)/g, "$1*")
    .replace(/(\d|\)|pi|e)(?=\()/g, "$1*");

  // Auto-close nthRoot functions if needed
  const openNth = (normalized.match(/nthRoot\(/g) || []).length;
  const totalClose = (normalized.match(/\)/g) || []).length;
  const totalOpen = (normalized.match(/\(/g) || []).length;
  
  if (openNth > totalClose) {
    normalized += ")".repeat(openNth - (totalClose - (totalOpen - openNth)));
  }

  // Remove extra whitespace
  return normalized.replace(/\s+/g, "");
}

/**
 * Computes factorial for non-negative integers up to 170.
 * @param {number} n
 * @returns {number}
 */
function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity; // Prevent overflow
  
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/* ===== Custom Math.js Functions ===== */
/**
 * Defines custom functions for math.js
 */
function defineCustomFunctions() {
  if (typeof math !== "undefined" && math.import) {
    try {
      math.import({
        factorial: factorial,
        nthRoot: function(x, n) {
          if (n === 0) throw new Error("Division by zero");
          if (x < 0 && n % 2 === 0) throw new Error("Invalid input");
          return Math.pow(Math.abs(x), 1/n) * (x < 0 ? -1 : 1);
        }
      }, { override: true });
    } catch (e) {
      console.warn("Failed to import custom math functions:", e);
    }
  }
}

/* ===== Mobile-Specific CSS Additions ===== */
/**
 * Adds mobile-specific styles dynamically
 */
function addMobileStyles() {
  if (!isMobile) return;
  
  const style = document.createElement('style');
  style.textContent = `
    /* Mobile touch feedback */
    .tab.touch-active,
    button.touch-active {
      transform: scale(0.95);
      opacity: 0.7;
      transition: transform 0.1s ease, opacity 0.1s ease;
    }
    
    /* Improve mobile touch targets */
    @media (max-width: 768px) {
      .tab {
        min-height: 44px;
        padding: 12px 20px;
      }
      
      button {
        min-height: 44px;
        min-width: 44px;
      }
      
      /* Prevent zoom on input focus */
      .display {
        font-size: 16px !important;
      }
      
      /* Better mobile scrolling */
      .calc-wrap {
        -webkit-overflow-scrolling: touch;
      }
      
      /* Mobile-specific hover states */
      .tab:active,
      button:active {
        background-color: var(--button-active-color, #e0e0e0);
      }
    }
  `;
  document.head.appendChild(style);
}

/* ===== Boot ===== */
document.addEventListener("DOMContentLoaded", () => {
  let retries = 0;
  const maxRetries = 10;
  
  function tryInit() {
    if (typeof math === "undefined" && retries < maxRetries) {
      retries++;
      setTimeout(tryInit, 100);
      return;
    }
    
    if (typeof math === "undefined") {
      const errorRegion = document.querySelector(".error-region");
      if (errorRegion) {
        errorRegion.textContent = "Failed to load calculator library";
      }
      console.error("math.js library failed to load");
      return;
    }
    
    try {
      defineCustomFunctions();
      addMobileStyles();
      initCalculator();
      
      // Track successful initialization
      trackEvent("calculator_initialized", {
        is_mobile: isMobile,
        user_agent: navigator.userAgent,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight
      });
      
    } catch (error) {
      console.error("Calculator initialization failed:", error);
      const errorRegion = document.querySelector(".error-region");
      if (errorRegion) {
        errorRegion.textContent = "Calculator initialization failed";
      }
      
      trackEvent("calculator_init_error", {
        error: error.message,
        is_mobile: isMobile
      });
    }
  }
  
  tryInit();
});

// Handle viewport changes on mobile
if (isMobile) {
  window.addEventListener('orientationchange', function() {
    setTimeout(() => {
      // Re-initialize focus states after orientation change
      const activePanel = document.querySelector('.panel.active');
      if (activePanel) {
        const display = activePanel.querySelector('.display');
        if (display) display.blur(); // Prevent keyboard issues
      }
    }, 500);
  });
  
  // Handle iOS viewport height issues
  window.addEventListener('resize', function() {
    // Update CSS custom property for viewport height
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  });
  
  // Set initial viewport height
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

// Exports for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { 
    calculateResult, 
    factorial, 
    isFiniteNumber, 
    roundDisplay, 
    normalizeForEvaluate,
    handleButtonPress,
    trackEvent,
    isMobile,
    addHapticFeedback
  };
}