(() => {
    const TRANSITION_COLOR = '#462d14';
    const PAGE_ENTER_OVERLAY_MS = 1550;
    const PAGE_EXIT_OVERLAY_MS = 1200;
    const PAGE_FADE_MS = 1700;
    const MENU_TRANSITION_STORAGE_KEY = 'menuPageDirectionalTransition';
    const MENU_EXIT_MS = 620;
    const MENU_ENTER_MS = 760;
    const MENU_STAGGER_MS = 30;
    const MENU_MAX_STAGGER_MS = 240;
    const MENU_SLIDE_PX = 78;
    const MENU_NAVIGATE_BUFFER_MS = 140;
    const MENU_PAGE_ORDER = {
        'index.html': 1,
        'publicidade.html': 2,
        'ficcao.html': 3,
        'videoclipes.html': 4,
        'sobre.html': 5
    };

    const body = document.body;
    if (!body) return;

    const consumeMenuTransitionState = () => {
        const raw = window.sessionStorage.getItem(MENU_TRANSITION_STORAGE_KEY);
        if (!raw) return null;

        window.sessionStorage.removeItem(MENU_TRANSITION_STORAGE_KEY);

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || (parsed.exitSign !== -1 && parsed.exitSign !== 1)) {
                return null;
            }

            if (typeof parsed.timestamp !== 'number') return null;
            if (Date.now() - parsed.timestamp > 7000) return null;

            return parsed;
        } catch {
            return null;
        }
    };

    const pendingMenuTransition = consumeMenuTransitionState();
    const hasPendingMenuEntry = Boolean(pendingMenuTransition);

    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/.test(ua);
    if (isSafari) {
        body.classList.add('safari-browser');
    }

    body.style.opacity = hasPendingMenuEntry ? '1' : '0';
    body.style.transition = hasPendingMenuEntry
        ? 'none'
        : `opacity ${PAGE_FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;

    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = TRANSITION_COLOR;
    overlay.style.opacity = hasPendingMenuEntry ? '0' : '1';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '99999';
    overlay.style.transition = hasPendingMenuEntry
        ? 'none'
        : `opacity ${PAGE_ENTER_OVERLAY_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    body.appendChild(overlay);

    if (!hasPendingMenuEntry) {
        requestAnimationFrame(() => {
            overlay.style.opacity = '0';
            body.style.opacity = '1';
        });
    }

    const isEligibleLink = (anchor) => {
        if (!anchor) return false;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#')) return false;
        if (anchor.target && anchor.target !== '_self') return false;
        if (anchor.hasAttribute('download')) return false;
        return true;
    };

    const normalizePathname = (pathname) => pathname.replace(/\/+$/, '').toLowerCase() || '/';

    const toPageKey = (pathname) => {
        const normalizedPath = normalizePathname(pathname);
        const segment = normalizedPath.split('/').pop() || '';
        return segment || 'index.html';
    };

    const getPageOrder = (pathname) => MENU_PAGE_ORDER[toPageKey(pathname)] || null;

    const getMenuLinks = () => {
        const nav = document.querySelector('header nav');
        if (!nav) return [];

        return Array.from(nav.querySelectorAll('a[href]')).filter((link) => {
            const href = link.getAttribute('href') || '';
            return href.endsWith('.html');
        });
    };

    const resolveMenuMotion = (targetUrl) => {
        const currentOrder = getPageOrder(window.location.pathname);
        const targetOrder = getPageOrder(targetUrl.pathname);
        if (!currentOrder || !targetOrder || currentOrder === targetOrder) return null;

        const movingRightInMenu = targetOrder > currentOrder;
        return {
            currentOrder,
            targetOrder,
            // If going to the right in menu, current page exits left; otherwise exits right.
            exitSign: movingRightInMenu ? -1 : 1
        };
    };

    const collectMenuTransitionTargets = () => {
        const targets = [];
        const header = document.querySelector('header');
        if (header) targets.push(header);

        const section = document.querySelector('section');
        if (!section) return targets;

        const galleryItems = Array.from(section.querySelectorAll('.grid .item, .vertical-grid .vertical-item'));
        if (galleryItems.length) {
            targets.push(...galleryItems);
        } else {
            const sectionChildren = Array.from(section.children);
            if (sectionChildren.length) {
                targets.push(...sectionChildren);
            } else {
                targets.push(section);
            }
        }

        return Array.from(new Set(targets));
    };

    const applyMenuEntryTransition = (entrySign) => {
        const targets = collectMenuTransitionTargets();
        if (!targets.length) return;

        targets.forEach((element, index) => {
            const distance = MENU_SLIDE_PX + Math.min(index * 2, 20);
            element.style.transition = 'none';
            element.style.willChange = 'transform, opacity, filter';
            element.style.transform = `translate3d(${entrySign * distance}px, 0, 0)`;
            element.style.opacity = '0';
            element.style.filter = 'blur(1.2px)';
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                targets.forEach((element, index) => {
                    const delay = Math.min(index * MENU_STAGGER_MS, MENU_MAX_STAGGER_MS);
                    element.style.transition = [
                        `transform ${MENU_ENTER_MS}ms cubic-bezier(0.22, 0.84, 0.28, 1) ${delay}ms`,
                        `opacity ${MENU_ENTER_MS}ms cubic-bezier(0.22, 0.84, 0.28, 1) ${delay}ms`,
                        `filter ${Math.max(360, MENU_ENTER_MS - 120)}ms ease ${delay}ms`
                    ].join(', ');
                    element.style.transform = 'translate3d(0, 0, 0)';
                    element.style.opacity = '1';
                    element.style.filter = 'blur(0)';
                });

                const clearAfter = MENU_ENTER_MS + MENU_MAX_STAGGER_MS + 120;
                window.setTimeout(() => {
                    targets.forEach((element) => {
                        element.style.removeProperty('will-change');
                        element.style.removeProperty('filter');
                    });
                }, clearAfter);
            });
        });
    };

    const runMenuExitTransition = (exitSign, onComplete) => {
        const targets = collectMenuTransitionTargets();
        if (!targets.length) {
            onComplete();
            return;
        }

        targets.forEach((element, index) => {
            const delay = Math.min(index * MENU_STAGGER_MS, MENU_MAX_STAGGER_MS);
            const distance = MENU_SLIDE_PX + Math.min(index * 2, 20);
            element.style.willChange = 'transform, opacity, filter';
            element.style.transition = [
                `transform ${MENU_EXIT_MS}ms cubic-bezier(0.32, 0, 0.67, 0) ${delay}ms`,
                `opacity ${MENU_EXIT_MS}ms cubic-bezier(0.32, 0, 0.67, 0) ${delay}ms`,
                `filter ${Math.max(280, MENU_EXIT_MS - 120)}ms ease ${delay}ms`
            ].join(', ');
            element.style.transform = `translate3d(${exitSign * distance}px, 0, 0)`;
            element.style.opacity = '0';
            element.style.filter = 'blur(1.2px)';
        });

        const maxDelay = Math.min((targets.length - 1) * MENU_STAGGER_MS, MENU_MAX_STAGGER_MS);
        window.setTimeout(onComplete, MENU_EXIT_MS + maxDelay + MENU_NAVIGATE_BUFFER_MS);
    };

    if (hasPendingMenuEntry) {
        applyMenuEntryTransition(-pendingMenuTransition.exitSign);
    }

    document.addEventListener('click', (event) => {
        const anchor = event.target.closest('a');
        if (!isEligibleLink(anchor)) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        const isMenuLink = Boolean(anchor.closest('header nav'));
        if (isMenuLink) {
            const motion = resolveMenuMotion(url);
            if (motion) {
                event.preventDefault();
                window.sessionStorage.setItem(
                    MENU_TRANSITION_STORAGE_KEY,
                    JSON.stringify({
                        exitSign: motion.exitSign,
                        from: motion.currentOrder,
                        to: motion.targetOrder,
                        timestamp: Date.now()
                    })
                );
                runMenuExitTransition(motion.exitSign, () => {
                    window.location.href = url.href;
                });
                return;
            }
        }

        event.preventDefault();
        overlay.style.transition = `opacity ${PAGE_EXIT_OVERLAY_MS}ms cubic-bezier(0.32, 0, 0.67, 0)`;
        overlay.style.opacity = '1';
        body.style.transition = `opacity ${Math.round(PAGE_EXIT_OVERLAY_MS * 0.82)}ms cubic-bezier(0.32, 0, 0.67, 0)`;
        body.style.opacity = '0';

        window.setTimeout(() => {
            window.location.href = url.href;
        }, PAGE_EXIT_OVERLAY_MS);
    });

    // Skip first/last problematic frames on video 11 to avoid black flashes at loop boundaries.
    const glitchVideo = document.querySelector('source[src*="PUBLICIDADE_HORIZONTAL_11.mp4"]')?.parentElement;
    if (glitchVideo instanceof HTMLVideoElement) {
        const START_OFFSET = 0.12;
        const END_GUARD = 0.1;
        glitchVideo.preload = 'auto';

        const snapToSafeStart = () => {
            if (Number.isFinite(glitchVideo.duration) && glitchVideo.duration > START_OFFSET) {
                glitchVideo.currentTime = START_OFFSET;
            }
        };

        glitchVideo.addEventListener('loadeddata', snapToSafeStart);
        glitchVideo.addEventListener('ended', snapToSafeStart);
        glitchVideo.addEventListener('seeking', () => {
            if (glitchVideo.currentTime < START_OFFSET) {
                glitchVideo.currentTime = START_OFFSET;
            }
        });

        glitchVideo.addEventListener('timeupdate', () => {
            if (!Number.isFinite(glitchVideo.duration) || glitchVideo.duration <= 0) return;
            if (glitchVideo.duration - glitchVideo.currentTime < END_GUARD) {
                glitchVideo.currentTime = START_OFFSET;
                if (glitchVideo.paused) {
                    glitchVideo.play().catch(() => {});
                }
            }
        });
    }

    const getVimeoId = (url) => {
        const match = url.match(/vimeo\.com\/(\d+)/);
        return match ? match[1] : null;
    };

    const getHorizontalGrid = () => document.querySelector('.grid:not(.vertical-grid)');
    const getHorizontalItems = () => {
        const grid = getHorizontalGrid();
        if (!grid) return [];
        return Array.from(grid.querySelectorAll(':scope > .item')).filter((item) => item.querySelector('.quadro'));
    };
    const getVerticalItems = () => Array.from(document.querySelectorAll('.vertical-grid .vertical-item')).filter((item) => item.querySelector('.quadro-vertical'));

    const initCinematicEyeCursor = () => {
        const cursor = document.createElement('div');
        cursor.className = 'cinema-eye-cursor';
        cursor.innerHTML = `
            <div class="cinema-eye-shape">
                <div class="cinema-eye-iris">
                    <div class="cinema-eye-pupil"></div>
                    <div class="cinema-eye-highlight"></div>
                </div>
            </div>
        `;
        body.appendChild(cursor);
        body.classList.add('eye-cursor-enabled');

        let targetX = -9999;
        let targetY = -9999;
        let pointerX = -9999;
        let pointerY = -9999;
        let hoveredFrame = null;
        let rafId = null;
        let overVideoFrame = false;
        let yellowDelayTimer = null;

        const setCursorTone = (tone) => {
            if (tone === 'yellow') {
                cursor.style.setProperty('--eye-fill-rgb', '255 210 72');
                cursor.style.setProperty('--eye-glow-rgb', '255 228 132');
                return;
            }

            cursor.style.setProperty('--eye-fill-rgb', '255 255 255');
            cursor.style.setProperty('--eye-glow-rgb', '255 255 255');
        };

        const resolveFrameUnderPointer = (x, y) => {
            const element = document.elementFromPoint(x, y);
            return element ? element.closest('.quadro, .quadro-vertical') : null;
        };

        const updateHoveredFrame = (frame) => {
            if (hoveredFrame === frame) return;

            if (yellowDelayTimer) {
                window.clearTimeout(yellowDelayTimer);
                yellowDelayTimer = null;
            }

            hoveredFrame = frame;

            if (!hoveredFrame) {
                overVideoFrame = false;
                setCursorTone('white');
                cursor.classList.remove('visible');
                stopRender();
                return;
            }

            overVideoFrame = Boolean(hoveredFrame.querySelector('video, .vimeo-underframe'));
            setCursorTone('white');
            cursor.classList.add('visible');
            startRender();

            if (overVideoFrame) {
                const frameRef = hoveredFrame;
                yellowDelayTimer = window.setTimeout(() => {
                    if (hoveredFrame === frameRef) {
                        setCursorTone('yellow');
                    }
                    yellowDelayTimer = null;
                }, 280);
            }
        };

        const render = () => {
            pointerX += (targetX - pointerX) * 0.26;
            pointerY += (targetY - pointerY) * 0.26;
            cursor.style.transform = `translate3d(${pointerX - 17}px, ${pointerY - 17}px, 0)`;

            rafId = window.requestAnimationFrame(render);
        };

        const startRender = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(render);
        };

        const stopRender = () => {
            if (!rafId) return;
            window.cancelAnimationFrame(rafId);
            rafId = null;
        };

        document.addEventListener('mousemove', (event) => {
            targetX = event.clientX;
            targetY = event.clientY;
            updateHoveredFrame(resolveFrameUnderPointer(targetX, targetY));
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopRender();
            } else if (hoveredFrame) {
                startRender();
            }
        });
    };

    initCinematicEyeCursor();

    const ZOOM_MODE_KEY = 'frameZoomAnimationsEnabled';
    const DEFAULT_VIMEO_ID = '1103764375';
    if (window.localStorage.getItem(ZOOM_MODE_KEY) === null) {
        window.localStorage.setItem(ZOOM_MODE_KEY, '0');
    }
    const ENABLE_ZOOM_ANIMATIONS = window.localStorage.getItem(ZOOM_MODE_KEY) === '1';
    window.activateFrameZoomAnimations = () => {
        window.localStorage.setItem(ZOOM_MODE_KEY, '1');
        window.location.reload();
    };
    window.disableFrameZoomAnimations = () => {
        window.localStorage.setItem(ZOOM_MODE_KEY, '0');
        window.location.reload();
    };

    const resetAllInlinePlayers = () => {
        getHorizontalItems().forEach((item) => {
            const quadro = item.querySelector('.quadro');
            const sourceVideo = quadro?.querySelector('video');
            const vimeoPlayer = quadro?.querySelector('.vimeo-underframe');
            if (vimeoPlayer) vimeoPlayer.remove();
            if (sourceVideo) {
                sourceVideo.classList.remove('hidden-video');
                sourceVideo.play().catch(() => {});
            }
        });

        getVerticalItems().forEach((item) => {
            const quadro = item.querySelector('.quadro-vertical');
            const sourceVideo = quadro?.querySelector('video');
            const vimeoPlayer = quadro?.querySelector('.vimeo-underframe');
            if (vimeoPlayer) vimeoPlayer.remove();
            if (sourceVideo) {
                sourceVideo.classList.remove('hidden-video');
                sourceVideo.play().catch(() => {});
            }
        });
    };

    const openInlineVimeo = (quadro, sourceVideo, vimeoId) => {
        if (!quadro || !sourceVideo || !vimeoId) return;

        const iframe = document.createElement('iframe');
        iframe.className = 'vimeo-underframe';
        iframe.src = `https://player.vimeo.com/video/${vimeoId}?autoplay=1&loop=1&muted=1&autopause=0&title=0&byline=0&portrait=0`;
        iframe.loading = 'eager';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        iframe.setAttribute('allowfullscreen', '');
        iframe.style.pointerEvents = 'auto';
        iframe.style.cursor = 'none';
        quadro.appendChild(iframe);

        iframe.addEventListener(
            'load',
            () => {
                sourceVideo.pause();
                sourceVideo.classList.add('hidden-video');
                iframe.classList.add('active');
            },
            { once: true }
        );
    };

    if (!ENABLE_ZOOM_ANIMATIONS) {
        body.classList.remove('zoom-context');
        body.classList.remove('zoom-returning');
        body.style.removeProperty('--zoom-origin-x');
        body.style.removeProperty('--zoom-origin-y');
        body.style.removeProperty('--zoom-page-scale');
        body.style.removeProperty('--zoom-pan-x');
        body.style.removeProperty('--zoom-pan-y');
        body.style.removeProperty('--zoom-duration-main');
        body.style.removeProperty('--zoom-duration-fade');

        getHorizontalItems().forEach((item) => {
            item.classList.add('zoom-item');
            item.classList.remove('zoom-active', 'zoom-neighbor', 'zoom-dimmed');
            const frame = item.querySelector('.quadro');
            if (!frame) return;

            frame.addEventListener('click', (event) => {
                event.stopPropagation();
                resetAllInlinePlayers();

                const quadro = item.querySelector('.quadro');
                const sourceVideo = quadro?.querySelector('video');
                if (!quadro || !sourceVideo) return;

                const vimeoId = getVimeoId(item.getAttribute('data-vimeo-url') || '') || DEFAULT_VIMEO_ID;
                openInlineVimeo(quadro, sourceVideo, vimeoId);
            });
        });

        getVerticalItems().forEach((item) => {
            const frame = item.querySelector('.quadro-vertical');
            if (!frame) return;

            frame.addEventListener('click', (event) => {
                event.stopPropagation();
                resetAllInlinePlayers();

                const quadro = item.querySelector('.quadro-vertical');
                const sourceVideo = quadro?.querySelector('video');
                if (!quadro || !sourceVideo) return;

                openInlineVimeo(quadro, sourceVideo, DEFAULT_VIMEO_ID);
            });
        });

        document.addEventListener('click', (event) => {
            if (event.target.closest('.quadro') || event.target.closest('.quadro-vertical')) return;
            resetAllInlinePlayers();
        });

        return;
    }

    getHorizontalItems().forEach((item) => item.classList.add('zoom-item'));

    const zoomNav = document.createElement('div');
    zoomNav.className = 'zoom-nav';
    zoomNav.setAttribute('aria-hidden', 'true');

    const createNavButton = (direction, label, arrow) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `zoom-nav-btn zoom-nav-${direction}`;
        button.dataset.direction = direction;
        button.setAttribute('aria-label', label);
        button.textContent = arrow;
        zoomNav.appendChild(button);
        return button;
    };

    const navButtons = {
        left: createNavButton('left', 'Quadro anterior', '←'),
        right: createNavButton('right', 'Quadro seguinte', '→'),
        up: createNavButton('up', 'Quadro acima', '↑'),
        down: createNavButton('down', 'Quadro abaixo', '↓')
    };
    body.appendChild(zoomNav);

    let activeZoomItem = null;
    let selectedZoomItem = null;
    let closeCleanupTimer = null;
    let isZoomClosing = false;
    let navTrackRaf = null;
    let wheelAccumX = 0;
    let wheelAccumY = 0;
    let wheelNavigatedInGesture = false;
    let wheelGestureTimer = null;
    let zoomMoveLockUntil = 0;
    let deferredCloseTimer = null;
    let deferredOpenTimer = null;
    let frameToCloseFrom = null;
    let pendingZoomItem = null;

    const clearZoomTimers = () => {
        if (closeCleanupTimer) {
            window.clearTimeout(closeCleanupTimer);
            closeCleanupTimer = null;
        }
        if (deferredCloseTimer) {
            window.clearTimeout(deferredCloseTimer);
            deferredCloseTimer = null;
        }
        if (deferredOpenTimer) {
            window.clearTimeout(deferredOpenTimer);
            deferredOpenTimer = null;
        }
        frameToCloseFrom = null;
    };

    const scheduleOpenAfterLock = (item) => {
        if (!item) return;
        pendingZoomItem = item;
        if (deferredOpenTimer) {
            window.clearTimeout(deferredOpenTimer);
        }
        const delay = Math.max(0, zoomMoveLockUntil - Date.now()) + 16;
        deferredOpenTimer = window.setTimeout(() => {
            deferredOpenTimer = null;
            if (!isZoomClosing && pendingZoomItem) {
                openZoomItem(pendingZoomItem, true);
            }
        }, delay);
    };

    const stopNavTracking = () => {
        if (navTrackRaf) {
            window.cancelAnimationFrame(navTrackRaf);
            navTrackRaf = null;
        }
    };

    const trackNavPosition = () => {
        if (!activeZoomItem || !body.classList.contains('zoom-context') || isZoomClosing) {
            stopNavTracking();
            return;
        }
        updateNavButtons();
        navTrackRaf = window.requestAnimationFrame(trackNavPosition);
    };

    const startNavTracking = () => {
        stopNavTracking();
        navTrackRaf = window.requestAnimationFrame(trackNavPosition);
    };

    const clearOpacityState = () => {
        getHorizontalItems().forEach((item) => {
            item.classList.remove('zoom-neighbor');
            item.classList.remove('zoom-dimmed');
        });
    };

    const applyOpacityState = (item) => {
        clearOpacityState();
        if (!item) return;

        const neighbors = getNeighbors(item);
        const neighborSet = new Set(Object.values(neighbors).filter(Boolean));

        getHorizontalItems().forEach((candidate) => {
            if (candidate === item) return;
            if (neighborSet.has(candidate)) {
                candidate.classList.add('zoom-neighbor');
            } else {
                candidate.classList.add('zoom-dimmed');
            }
        });
    };

    const cleanupItemMedia = (item) => {
        if (!item) return;
        const quadro = item.querySelector('.quadro');
        const sourceVideo = quadro?.querySelector('video');
        const vimeoPlayer = quadro?.querySelector('.vimeo-underframe');
        if (vimeoPlayer) vimeoPlayer.remove();
        if (sourceVideo) {
            sourceVideo.classList.remove('hidden-video');
            sourceVideo.play().catch(() => {});
        }
    };

    const setExclusiveActiveItem = (item) => {
        getHorizontalItems().forEach((candidate) => {
            candidate.classList.toggle('zoom-active', candidate === item);
        });
    };

    const getNeighbors = (item) => {
        const items = getHorizontalItems();
        const quadro = item?.querySelector('.quadro');
        if (!item || !quadro) return { left: null, right: null, up: null, down: null };

        const currentRect = quadro.getBoundingClientRect();
        const cx = currentRect.left + currentRect.width / 2;
        const cy = currentRect.top + currentRect.height / 2;
        const rowTolerance = Math.max(16, currentRect.height * 0.45);
        const colTolerance = Math.max(16, currentRect.width * 0.45);

        let left = null;
        let right = null;
        let up = null;
        let down = null;

        let leftScore = Number.NEGATIVE_INFINITY;
        let rightScore = Number.POSITIVE_INFINITY;
        let upScore = Number.NEGATIVE_INFINITY;
        let downScore = Number.POSITIVE_INFINITY;

        items.forEach((candidate) => {
            if (candidate === item) return;
            const candidateQuadro = candidate.querySelector('.quadro');
            if (!candidateQuadro) return;

            const rect = candidateQuadro.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            if (Math.abs(y - cy) <= rowTolerance) {
                if (x < cx && x > leftScore) {
                    leftScore = x;
                    left = candidate;
                }
                if (x > cx && x < rightScore) {
                    rightScore = x;
                    right = candidate;
                }
            }

            if (Math.abs(x - cx) <= colTolerance) {
                if (y < cy && y > upScore) {
                    upScore = y;
                    up = candidate;
                }
                if (y > cy && y < downScore) {
                    downScore = y;
                    down = candidate;
                }
            }
        });

        return { left, right, up, down };
    };

    const updateNavButtons = () => {
        if (!activeZoomItem || !body.classList.contains('zoom-context')) {
            zoomNav.classList.remove('active');
            clearOpacityState();
            return;
        }

        const neighbors = getNeighbors(activeZoomItem);
        applyOpacityState(activeZoomItem);
        zoomNav.classList.add('active');

        Object.entries(navButtons).forEach(([direction, button]) => {
            const target = neighbors[direction];
            if (target) {
                button.classList.add('active');
                button.disabled = false;
            } else {
                button.classList.remove('active');
                button.disabled = true;
            }
        });
    };

    const syncZoomVarsToRenderedState = () => {
        const grid = getHorizontalGrid();
        if (!grid || !body.classList.contains('zoom-context')) return;

        const transform = window.getComputedStyle(grid).transform;
        if (!transform || transform === 'none') return;

        let scale = parseFloat(body.style.getPropertyValue('--zoom-page-scale')) || 1;
        let tx = parseFloat(body.style.getPropertyValue('--zoom-pan-x')) || 0;
        let ty = parseFloat(body.style.getPropertyValue('--zoom-pan-y')) || 0;

        if (transform.startsWith('matrix3d(')) {
            const values = transform
                .slice(9, -1)
                .split(',')
                .map((v) => parseFloat(v.trim()));
            if (values.length === 16 && values.every((v) => Number.isFinite(v))) {
                scale = Math.hypot(values[0], values[1]);
                tx = values[12];
                ty = values[13];
            }
        } else if (transform.startsWith('matrix(')) {
            const values = transform
                .slice(7, -1)
                .split(',')
                .map((v) => parseFloat(v.trim()));
            if (values.length === 6 && values.every((v) => Number.isFinite(v))) {
                scale = Math.hypot(values[0], values[1]);
                tx = values[4];
                ty = values[5];
            }
        }

        body.style.setProperty('--zoom-page-scale', String(scale));
        body.style.setProperty('--zoom-pan-x', `${tx}px`);
        body.style.setProperty('--zoom-pan-y', `${ty}px`);
    };

    const alignRenderedZoomToItem = (item) => {
        const quadro = item?.querySelector('.quadro');
        if (!quadro || !body.classList.contains('zoom-context')) return;

        const rect = quadro.getBoundingClientRect();
        const frameCenterX = rect.left + rect.width / 2;
        const frameCenterY = rect.top + rect.height / 2;
        const deltaX = window.innerWidth / 2 - frameCenterX;
        const deltaY = window.innerHeight / 2 - frameCenterY;

        const currentPanX = parseFloat(body.style.getPropertyValue('--zoom-pan-x')) || 0;
        const currentPanY = parseFloat(body.style.getPropertyValue('--zoom-pan-y')) || 0;
        body.style.setProperty('--zoom-pan-x', `${currentPanX + deltaX}px`);
        body.style.setProperty('--zoom-pan-y', `${currentPanY + deltaY}px`);
    };

    const closeZoomItem = (item) => {
        const domActiveItem = document.querySelector('.grid:not(.vertical-grid) .item.zoom-active');
        const frameToClose = item || domActiveItem || activeZoomItem || pendingZoomItem || selectedZoomItem;
        if (!frameToClose || isZoomClosing) return;

        const now = Date.now();
        if (now < zoomMoveLockUntil) {
            frameToCloseFrom = frameToClose;
            if (deferredCloseTimer) {
                window.clearTimeout(deferredCloseTimer);
            }
            deferredCloseTimer = window.setTimeout(() => {
                deferredCloseTimer = null;
                closeZoomItem(frameToCloseFrom);
            }, zoomMoveLockUntil - now + 16);
            return;
        }

        const currentItem = frameToClose;
        pendingZoomItem = currentItem;
        selectedZoomItem = currentItem;
        activeZoomItem = currentItem;
        setExclusiveActiveItem(currentItem);
        
        isZoomClosing = true;
        stopNavTracking();
        clearZoomTimers();

        const closeMainMs = 2400;
        const closeFadeMs = 1600;
        
        syncZoomVarsToRenderedState();
        
        requestAnimationFrame(() => {
            body.style.setProperty('--zoom-origin-x', '50%');
            body.style.setProperty('--zoom-origin-y', '50%');
            body.style.setProperty('--zoom-duration-main', `${closeMainMs}ms`);
            body.style.setProperty('--zoom-duration-fade', `${closeFadeMs}ms`);
            
            requestAnimationFrame(() => {
                body.style.setProperty('--zoom-page-scale', '1');
                body.style.setProperty('--zoom-pan-x', '0px');
                body.style.setProperty('--zoom-pan-y', '0px');
                
                zoomMoveLockUntil = Date.now() + closeMainMs;
                body.classList.add('zoom-returning');
                
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        body.classList.remove('zoom-context');
                    });
                });
            });
        });
        
        zoomNav.classList.remove('active');
        clearOpacityState();

        closeCleanupTimer = window.setTimeout(() => {
            currentItem.classList.remove('zoom-active');
            cleanupItemMedia(currentItem);
            activeZoomItem = null;
            selectedZoomItem = null;
            pendingZoomItem = null;
            isZoomClosing = false;

            // Avoid delayed opacity recovery when leaving zoom-returning.
            body.style.setProperty('--zoom-duration-main', '0ms');
            body.style.setProperty('--zoom-duration-fade', '0ms');
            body.classList.remove('zoom-returning');

            body.style.removeProperty('--zoom-origin-x');
            body.style.removeProperty('--zoom-origin-y');
            body.style.removeProperty('--zoom-page-scale');
            body.style.removeProperty('--zoom-pan-x');
            body.style.removeProperty('--zoom-pan-y');
            body.style.removeProperty('--zoom-duration-main');
            body.style.removeProperty('--zoom-duration-fade');
        }, closeMainMs + 60);
    };

    const openZoomItem = (item, force = false) => {
        if (!item || isZoomClosing) return;
        pendingZoomItem = item;
        selectedZoomItem = item;
        if (!force && item !== activeZoomItem && Date.now() < zoomMoveLockUntil) {
            scheduleOpenAfterLock(item);
            return;
        }
        if (deferredOpenTimer) {
            window.clearTimeout(deferredOpenTimer);
            deferredOpenTimer = null;
        }
        activeZoomItem = item;
        setExclusiveActiveItem(item);

        const quadro = item.querySelector('.quadro');
        const sourceVideo = quadro?.querySelector('video');
        if (!quadro || !sourceVideo) return;

        const previousItem = activeZoomItem;
        if (previousItem && previousItem !== item) {
            cleanupItemMedia(previousItem);
        }

        clearZoomTimers();
        body.classList.remove('zoom-returning');

        const vimeoUrl = item.getAttribute('data-vimeo-url');
        const vimeoId = vimeoUrl ? getVimeoId(vimeoUrl) : null;

        const grid = item.closest('.grid:not(.vertical-grid)');
        const isAlreadyZoomed = body.classList.contains('zoom-context');
        if (isAlreadyZoomed) {
            syncZoomVarsToRenderedState();
        }
        const currentPanX = isAlreadyZoomed ? parseFloat(body.style.getPropertyValue('--zoom-pan-x')) || 0 : 0;
        const currentPanY = isAlreadyZoomed ? parseFloat(body.style.getPropertyValue('--zoom-pan-y')) || 0 : 0;
        const currentScale = isAlreadyZoomed ? parseFloat(body.style.getPropertyValue('--zoom-page-scale')) || 1 : 1;
        const gridRect = grid ? grid.getBoundingClientRect() : null;
        const quadroRect = quadro.getBoundingClientRect();
        const safeScale = currentScale > 0 ? currentScale : 1;
        const viewportCenterX = window.visualViewport
            ? window.visualViewport.offsetLeft + window.visualViewport.width / 2
            : window.innerWidth / 2;
        const viewportCenterY = window.visualViewport
            ? window.visualViewport.offsetTop + window.visualViewport.height / 2
            : window.innerHeight / 2;

        const frameCenterBaseX = gridRect
            ? (quadroRect.left - gridRect.left + quadroRect.width / 2) / safeScale
            : quadro.offsetWidth / 2;
        const frameCenterBaseY = gridRect
            ? (quadroRect.top - gridRect.top + quadroRect.height / 2) / safeScale
            : quadro.offsetHeight / 2;
        const baseGridWidth = gridRect ? gridRect.width / safeScale : grid?.offsetWidth || 0;
        const baseGridHeight = gridRect ? gridRect.height / safeScale : grid?.offsetHeight || 0;

        let originX = 50;
        let originY = 50;
        if (baseGridWidth > 0 && baseGridHeight > 0) {
            originX = (frameCenterBaseX / baseGridWidth) * 100;
            originY = (frameCenterBaseY / baseGridHeight) * 100;
            originX = Math.max(0, Math.min(100, originX));
            originY = Math.max(0, Math.min(100, originY));
        }

        const targetWidth = window.innerWidth * 0.9;
        const targetHeight = window.innerHeight * 0.9;
        const baseFrameWidth = quadro.offsetWidth || 1;
        const baseFrameHeight = quadro.offsetHeight || 1;
        const widthScale = targetWidth / baseFrameWidth;
        const heightScale = targetHeight / baseFrameHeight;
        const rawScale = Math.min(widthScale, heightScale);
        const maxScale = window.innerWidth < 900 ? 1.62 : 2.05;
        const zoomPageScale = Math.max(1.05, Math.min(rawScale, maxScale));

        let zoomPanX = 0;
        let zoomPanY = 0;
        if (gridRect) {
            const baseGridLeft = (gridRect.left - currentPanX) / safeScale;
            const baseGridTop = (gridRect.top - currentPanY) / safeScale;
            zoomPanX = viewportCenterX - (baseGridLeft + frameCenterBaseX) * zoomPageScale;
            zoomPanY = viewportCenterY - (baseGridTop + frameCenterBaseY) * zoomPageScale;
        }

        body.style.setProperty('--zoom-origin-x', `${originX}%`);
        body.style.setProperty('--zoom-origin-y', `${originY}%`);
        body.style.setProperty('--zoom-page-scale', String(zoomPageScale));
        body.style.setProperty('--zoom-pan-x', `${zoomPanX}px`);
        body.style.setProperty('--zoom-pan-y', `${zoomPanY}px`);
        body.style.setProperty('--zoom-duration-main', '1900ms');
        body.style.setProperty('--zoom-duration-fade', '1120ms');

        if (vimeoId) {
            const iframe = document.createElement('iframe');
            iframe.className = 'vimeo-underframe';
            iframe.src = `https://player.vimeo.com/video/${vimeoId}?autoplay=1&loop=1&muted=1&autopause=0&title=0&byline=0&portrait=0`;
            iframe.loading = 'eager';
            iframe.allow = 'autoplay; fullscreen; picture-in-picture';
            iframe.setAttribute('allowfullscreen', '');
            quadro.appendChild(iframe);

            const activateVimeo = () => {
                sourceVideo.pause();
                sourceVideo.classList.add('hidden-video');
                iframe.classList.add('active');
            };

            iframe.addEventListener('load', activateVimeo, { once: true });
        } else {
            sourceVideo.classList.remove('hidden-video');
            sourceVideo.play().catch(() => {});
        }

        body.classList.add('zoom-context');
        updateNavButtons();
        startNavTracking();
        zoomMoveLockUntil = Date.now() + 700;
    };

    getHorizontalItems().forEach((item) => {
        const frame = item.querySelector('.quadro');
        if (!frame) return;
        frame.addEventListener('click', (event) => {
            event.stopPropagation();

            if (body.classList.contains('zoom-context')) {
                const currentItem = activeZoomItem || selectedZoomItem;
                if (currentItem && currentItem !== item) {
                    openZoomItem(item);
                } else {
                    closeZoomItem(currentItem || item);
                }
                return;
            }

            selectedZoomItem = item;
            openZoomItem(item);
        });
    });

    zoomNav.addEventListener('click', (event) => {
        const button = event.target.closest('.zoom-nav-btn.active');
        if (!button || !activeZoomItem || isZoomClosing) return;
        const neighbors = getNeighbors(activeZoomItem);
        const nextItem = neighbors[button.dataset.direction];
        if (nextItem) {
            openZoomItem(nextItem);
        }
    });

    document.addEventListener(
        'wheel',
        (event) => {
            if (isZoomClosing || body.classList.contains('zoom-returning')) {
                event.preventDefault();
                return;
            }
            if (!activeZoomItem) return;
            if (Date.now() < zoomMoveLockUntil) return;

            event.preventDefault();

            wheelAccumX += event.deltaX;
            wheelAccumY += event.deltaY;

            if (wheelGestureTimer) {
                window.clearTimeout(wheelGestureTimer);
            }
            wheelGestureTimer = window.setTimeout(() => {
                wheelAccumX = 0;
                wheelAccumY = 0;
                wheelNavigatedInGesture = false;
                wheelGestureTimer = null;
            }, 140);

            if (wheelNavigatedInGesture) return;

            const absX = Math.abs(wheelAccumX);
            const absY = Math.abs(wheelAccumY);
            const magnitude = Math.max(absX, absY);
            if (magnitude < 18) return;

            const direction = absX > absY ? (wheelAccumX > 0 ? 'right' : 'left') : wheelAccumY > 0 ? 'down' : 'up';
            const neighbors = getNeighbors(activeZoomItem);
            const nextItem = neighbors[direction];
            if (!nextItem) return;

            wheelNavigatedInGesture = true;
            wheelAccumX = 0;
            wheelAccumY = 0;
            openZoomItem(nextItem);
        },
        { passive: false }
    );

    document.addEventListener('click', (event) => {
        if (!activeZoomItem || isZoomClosing) return;
        if (event.target.closest('.zoom-item.zoom-active')) return;
        if (event.target.closest('.zoom-nav')) return;
        closeZoomItem();
    });

    document.addEventListener('keydown', (event) => {
        if (!activeZoomItem || isZoomClosing) return;
        if (Date.now() < zoomMoveLockUntil && event.key !== 'Escape') return;

        if (event.key === 'Escape') {
            closeZoomItem();
            return;
        }

        const keyToDirection = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'up',
            ArrowDown: 'down'
        };
        const direction = keyToDirection[event.key];
        if (!direction) return;

        const neighbors = getNeighbors(activeZoomItem);
        const nextItem = neighbors[direction];
        if (!nextItem) return;

        event.preventDefault();
        openZoomItem(nextItem);
    });

    window.addEventListener('resize', () => {
        if (activeZoomItem && !isZoomClosing) {
            openZoomItem(activeZoomItem);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopNavTracking();
        } else if (activeZoomItem && body.classList.contains('zoom-context') && !isZoomClosing) {
            startNavTracking();
        }
    });
})();