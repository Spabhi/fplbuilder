/**
 * widgets.js - Logic for free-floating draggable UI sections
 */

export function initWidgets() {
  const pitchWidget = document.getElementById('pitch-widget');
  const liveWidget = document.getElementById('live-fixtures-area');
  const transferWidget = document.getElementById('transfer-log-area');
  const statusWidget = document.getElementById('squad-status-area');
  const chipsWidget = document.getElementById('chips-widget-area');

  if (pitchWidget) { makeDraggable(pitchWidget); makeResizable(pitchWidget); }
  if (liveWidget) { makeDraggable(liveWidget); makeResizable(liveWidget); }
  if (transferWidget) { makeDraggable(transferWidget); makeResizable(transferWidget); }
  if (statusWidget) { makeDraggable(statusWidget); makeResizable(statusWidget); }
  if (chipsWidget) { makeDraggable(chipsWidget); makeResizable(chipsWidget); }
}

let topZIndex = 100;

function makeDraggable(widget) {
  const handle = widget.querySelector('.drag-handle');
  if (!handle) return;

  let active = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  // Set position to absolute dynamically only after first click if we want absolute, 
  // but using transform keeps the flex flow intact and just visually translates it.
  
  const dragStart = (e) => {
    if (e.target !== handle && !handle.contains(e.target)) {
      return; // Only drag from the handle
    }

    if (e.type === 'touchstart') {
      initialX = e.touches[0].clientX - xOffset;
      initialY = e.touches[0].clientY - yOffset;
    } else {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
    }

    active = true;
    widget.classList.add('is-dragging');
    
    // Bring to front
    topZIndex++;
    widget.style.zIndex = topZIndex;

    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
  };

  const dragEnd = () => {
    initialX = currentX;
    initialY = currentY;
    active = false;
    widget.classList.remove('is-dragging');

    document.removeEventListener('mousemove', drag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('mouseup', dragEnd);
    document.removeEventListener('touchend', dragEnd);
  };

  const drag = (e) => {
    if (active) {
      // Prevent default scrolling on mobile while dragging
      e.preventDefault(); 
      
      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, widget);
    }
  };

  const setTranslate = (xPos, yPos, el) => {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  };

  // Attach start events
  widget.addEventListener('mousedown', dragStart);
  widget.addEventListener('touchstart', dragStart, { passive: false });
  
  // Set initial transform
  widget.style.transform = `translate3d(0px, 0px, 0)`;
}

function makeResizable(widget) {
  const handle = widget.querySelector('.resize-handle');
  if (!handle) return;

  let active = false;
  let initialX;
  let initialWidth;

  const resizeStart = (e) => {
    // Prevent triggering drag logic on handle click
    e.stopPropagation();

    if (e.type === 'touchstart') {
      initialX = e.touches[0].clientX;
    } else {
      initialX = e.clientX;
    }
    
    // Get current computed width
    initialWidth = parseInt(window.getComputedStyle(widget).width, 10);
    active = true;

    // Bring to front while resizing
    topZIndex++;
    widget.style.zIndex = topZIndex;

    document.addEventListener('mousemove', resize);
    document.addEventListener('touchmove', resize, { passive: false });
    document.addEventListener('mouseup', resizeEnd);
    document.addEventListener('touchend', resizeEnd);
  };

  const resizeEnd = () => {
    active = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('touchmove', resize);
    document.removeEventListener('mouseup', resizeEnd);
    document.removeEventListener('touchend', resizeEnd);
  };

  const resize = (e) => {
    if (active) {
      e.preventDefault();
      
      let currentX;
      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX;
      } else {
        currentX = e.clientX;
      }

      const diffX = currentX - initialX;
      const newWidth = Math.max(300, initialWidth + diffX); // min-width 300px
      widget.style.width = `${newWidth}px`;
    }
  };

  handle.addEventListener('mousedown', resizeStart);
  handle.addEventListener('touchstart', resizeStart, { passive: false });
}
