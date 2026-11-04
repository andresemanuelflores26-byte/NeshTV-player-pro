import { useEffect } from 'react';

export function useTvRemote(onBack?: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;

      // D-Pad Arrow Navigation (supporting standard keys and Android TV keyCodes: 19=Up, 20=Down, 21=Left, 22=Right)
      const isUp = e.key === 'ArrowUp' || e.keyCode === 19;
      const isDown = e.key === 'ArrowDown' || e.keyCode === 20;
      const isLeft = e.key === 'ArrowLeft' || e.keyCode === 21;
      const isRight = e.key === 'ArrowRight' || e.keyCode === 22;

      if (isUp || isDown || isLeft || isRight) {
        const focusableElements = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), .tv-focusable'
          )
        ).filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        });

        if (focusableElements.length === 0) return;

        if (!activeEl || !focusableElements.includes(activeEl)) {
          focusableElements[0].focus();
          return;
        }

        const currentIndex = focusableElements.indexOf(activeEl);
        const currentRect = activeEl.getBoundingClientRect();

        let nextEl: HTMLElement | null = null;
        let minDistance = Infinity;

        focusableElements.forEach(el => {
          if (el === activeEl) return;
          const rect = el.getBoundingClientRect();

          let isValidDirection = false;
          let distance = Infinity;

          const dx = (rect.left + rect.width / 2) - (currentRect.left + currentRect.width / 2);
          const dy = (rect.top + rect.height / 2) - (currentRect.top + currentRect.height / 2);

          if (isUp && dy < -5) {
            isValidDirection = true;
            distance = Math.abs(dy) * 2 + Math.abs(dx);
          } else if (isDown && dy > 5) {
            isValidDirection = true;
            distance = Math.abs(dy) * 2 + Math.abs(dx);
          } else if (isLeft && dx < -5) {
            isValidDirection = true;
            distance = Math.abs(dx) * 2 + Math.abs(dy);
          } else if (isRight && dx > 5) {
            isValidDirection = true;
            distance = Math.abs(dx) * 2 + Math.abs(dy);
          }

          if (isValidDirection && distance < minDistance) {
            minDistance = distance;
            nextEl = el;
          }
        });

        if (nextEl) {
          e.preventDefault();
          (nextEl as HTMLElement).focus();
          (nextEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          // Linear fallback
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            const nextIndex = (currentIndex + 1) % focusableElements.length;
            focusableElements[nextIndex].focus();
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            const prevIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
            focusableElements[prevIndex].focus();
          }
        }
      }

      // Enter / OK Key (including Android TV DPad Center 23)
      if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 66 || e.keyCode === 23) {
        if (activeEl && typeof activeEl.click === 'function') {
          // If active element is an input, don't trigger click again if default handles it
          if (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') {
            activeEl.click();
          }
        }
      }

      // Backspace / Escape / Back key (KeyCode 4 or 27)
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 4 || e.keyCode === 27) {
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          // Allow backspace in text inputs
          return;
        }
        if (onBack) {
          e.preventDefault();
          onBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);
}
