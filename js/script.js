(() => {
    const PAGE_TRANSITION_STORAGE_KEY = 'pageSlideTransitionPending';
    const PAGE_TRANSITION_MODE_KEY = 'pageSlideTransitionMode';
    const PAGE_VIDEO_RESUME_STORAGE_KEY = 'pageTransitionVideoResume';
    const PAGE_VIDEO_RESUME_TTL_MS = 8000;
    const MENU_TRANSITION_STORAGE_KEY = 'menuPageDirectionalTransition';
    const MENU_PAGE_ORDER = {
        'index.html': 1,
        'publicidade.html': 2,
        'videoclipes.html': 3,
        'ficcao.html': 4,
        'sobre.html': 5
    };
    const PRETTY_PATH_BY_PAGE = {
        'index.html': 'home',
        'publicidade.html': 'commercials',
        'videoclipes.html': 'music',
        'ficcao.html': 'narrative',
        'sobre.html': 'about'
    };
    const PAGE_BY_PRETTY_PATH = {
        home: 'index.html',
        commercials: 'publicidade.html',
        music: 'videoclipes.html',
        narrative: 'ficcao.html',
        about: 'sobre.html'
    };

    const body = document.body;
    if (!body) return;
    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/.test(ua);
    const isMobileLikeViewport = () => window.matchMedia('(max-width: 1080px), (max-aspect-ratio: 1 / 1), (pointer: coarse)').matches;
    const networkInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const isConstrainedNetwork = Boolean(
        networkInfo && (networkInfo.saveData || /(^|-)2g/.test(String(networkInfo.effectiveType || '')))
    );

    const isVideoAutoplayManaged = (video) => {
        if (!video) return false;
        if (video.dataset.autoplayManaged !== undefined) {
            return video.dataset.autoplayManaged !== '0';
        }
        if (video.dataset.autoplay !== undefined) {
            return video.dataset.autoplay === '1';
        }
        return false;
    };

    if (isSafari) {
        body.classList.add('safari-browser');
    }
    if (isConstrainedNetwork) {
        body.classList.add('low-bandwidth');
    }
    const isPostTransitionLoad = window.sessionStorage.getItem(PAGE_TRANSITION_STORAGE_KEY) === '1';

    const isElementInViewport = (element, threshold = 0.12) => {
        const rect = element.getBoundingClientRect();
        const viewHeight = window.innerHeight || document.documentElement.clientHeight;
        const viewWidth = window.innerWidth || document.documentElement.clientWidth;
        const verticalVisible = rect.bottom >= viewHeight * threshold && rect.top <= viewHeight * (1 - threshold);
        const horizontalVisible = rect.right >= 0 && rect.left <= viewWidth;
        return verticalVisible && horizontalVisible;
    };

    let mediaLifecycleHandlersBound = false;

    const initMediaPerformanceOptimizations = () => {
        const videos = Array.from(document.querySelectorAll('video'));
        const images = Array.from(document.querySelectorAll('img'));
        const safariRevealLockActive = isSafari;
        const safariRevealReleasers = [];
        let resumeMap = null;

        try {
            const raw = window.sessionStorage.getItem(PAGE_VIDEO_RESUME_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const samePath = parsed?.pathname === window.location.pathname;
                const fresh = typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp < PAGE_VIDEO_RESUME_TTL_MS;
                if (samePath && fresh && parsed?.entries && typeof parsed.entries === 'object') {
                    resumeMap = parsed.entries;
                }
                window.sessionStorage.removeItem(PAGE_VIDEO_RESUME_STORAGE_KEY);
            }
        } catch {
            window.sessionStorage.removeItem(PAGE_VIDEO_RESUME_STORAGE_KEY);
        }

        images.forEach((img) => {
            if (!img.hasAttribute('decoding')) {
                img.decoding = 'async';
            }

            if (img.closest('.logo')) return;
            if (img.hasAttribute('loading')) return;

            img.loading = isElementInViewport(img, 0.04) ? 'eager' : 'lazy';
        });

        if (!videos.length) return;

        if (safariRevealLockActive) {
            body.classList.add('safari-reveal-lock');
        }

        const getVideoAutoplayManaged = (video) => {
            if (video.dataset.autoplayManaged !== undefined) {
                return video.dataset.autoplayManaged !== '0';
            }
            if (video.dataset.autoplay !== undefined) {
                return video.dataset.autoplay === '1';
            }
            return false;
        };

        const safePlay = (video) => {
            if (video.classList.contains('hidden-video')) return;
            if (!getVideoAutoplayManaged(video)) return;
            if (body.classList.contains('transition-hold-videos')) return;
            if (isConstrainedNetwork && video.dataset.allowConstrainedPlay !== '1') return;

            const attemptPlay = () => {
                video.play().catch(() => {
                    if (video.preload === 'none' || video.readyState < 2) {
                        video.preload = 'metadata';
                        video.load();
                        video.play().catch(() => {});
                    }
                });
            };

            if (!video.hasAttribute('autoplay')) {
                video.setAttribute('autoplay', '');
                video.autoplay = true;
            }

            if (video.preload === 'none') {
                video.preload = 'metadata';
                video.load();
                attemptPlay();
                return;
            }

            attemptPlay();
        };

        const setupVideoReveal = (video) => {
            if (video.dataset.revealBound === '1') return;
            video.dataset.revealBound = '1';
            video.classList.add('cinematic-video');

            const host = video.parentElement;
            if (host && host.nodeType === Node.ELEMENT_NODE) {
                host.classList.add('video-reveal-host');

                let overlay = null;
                try {
                    overlay = host.querySelector(':scope > .video-brown-overlay');
                } catch {
                    // Safari versions with partial :scope support can throw here.
                    overlay = host.querySelector('.video-brown-overlay');
                }
                if (!overlay) {
                    overlay = document.createElement('span');
                    overlay.className = 'video-brown-overlay';
                    const frameNode = host.querySelector('.frame, .frame-vertical');
                    host.insertBefore(overlay, frameNode || host.firstChild);
                } else if (overlay.parentElement !== host) {
                    const frameNode = host.querySelector('.frame, .frame-vertical');
                    host.insertBefore(overlay, frameNode || host.firstChild);
                }
            }

            let hasMarkedReady = false;
            const applyReady = () => {
                if (hasMarkedReady) return;
                hasMarkedReady = true;
                video.classList.add('is-ready');
                if (host && host.nodeType === Node.ELEMENT_NODE) {
                    host.classList.add('video-ready');
                }
            };

            safariRevealReleasers.push(applyReady);

            const markReady = () => {
                if (safariRevealLockActive && body.classList.contains('safari-reveal-lock')) {
                    video.dataset.safariRevealPending = '1';
                    return;
                }
                applyReady();
            };

            if (video.readyState >= 2) {
                requestAnimationFrame(markReady);
            }

            video.addEventListener('loadedmetadata', markReady, { once: true });
            video.addEventListener('loadeddata', markReady, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            video.addEventListener('canplaythrough', markReady, { once: true });
            video.addEventListener('playing', markReady, { once: true });
        };

        videos.forEach((video) => {
            setupVideoReveal(video);
        });

        if (safariRevealLockActive) {
            let released = false;
            const releaseSafariRevealLock = () => {
                if (released) return;
                released = true;
                safariRevealReleasers.forEach((release) => release());
                body.classList.remove('safari-reveal-lock');
            };

            window.addEventListener('load', () => {
                window.setTimeout(releaseSafariRevealLock, 120);
            }, { once: true });

            // Safety fallback in case Safari skips/defers load-media sequence.
            window.setTimeout(releaseSafariRevealLock, 900);
            window.setTimeout(releaseSafariRevealLock, 1900);
        }

        const prepareVideo = (video, isPriority) => {
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.playsInline = true;
            video.webkitPlaysInline = true;
            video.autoplay = true;

            const sourceEl = video.querySelector('source[src]');
            const rawSrc = sourceEl?.getAttribute('src') || video.getAttribute('src') || '';
            const resumeSeconds = rawSrc ? resumeMap?.[rawSrc] : null;
            if (!getVideoAutoplayManaged(video)) {
                if (!video.hasAttribute('preload')) {
                    video.preload = 'metadata';
                }
                return;
            }

            if (isConstrainedNetwork) {
                video.preload = isPriority ? 'metadata' : 'none';
                if (isPriority) {
                    video.dataset.allowConstrainedPlay = '1';
                    safePlay(video);
                }
                return;
            }

            if (isPostTransitionLoad) {
                video.preload = isPriority ? 'metadata' : 'none';
                if (isPriority && typeof resumeSeconds === 'number' && Number.isFinite(resumeSeconds) && resumeSeconds > 0.05) {
                    video.addEventListener('loadedmetadata', () => {
                        try {
                            const duration = Number.isFinite(video.duration) ? video.duration : null;
                            const clamped = duration
                                ? Math.min(Math.max(resumeSeconds, 0), Math.max(0, duration - 0.04))
                                : resumeSeconds;
                            video.currentTime = clamped;
                        } catch {
                            // Ignore seek errors on resume.
                        }
                        safePlay(video);
                    }, { once: true });
                    video.load();
                    return;
                }
                if (isPriority) {
                    if (video.preload === 'none') {
                        video.load();
                    }
                    safePlay(video);
                }
                return;
            }

            video.preload = isPriority ? 'metadata' : 'none';
            if (isPriority) {
                if (video.preload === 'none') {
                    video.load();
                }
                safePlay(video);
            }
        };

        const supportsIO = 'IntersectionObserver' in window;
        let observer = null;

        if (supportsIO) {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        const video = entry.target;
                        if (!getVideoAutoplayManaged(video)) return;

                        if (entry.isIntersecting) {
                            if (video.preload === 'none') {
                                video.preload = 'metadata';
                            }
                            if (isConstrainedNetwork && entry.intersectionRatio > 0.72) {
                                video.dataset.allowConstrainedPlay = '1';
                            }
                            if (entry.intersectionRatio > 0.35) {
                                safePlay(video);
                            }
                        } else {
                            video.pause();
                        }
                    });
                },
                {
                    root: null,
                    rootMargin: isConstrainedNetwork ? '40px 0px' : '120px 0px',
                    threshold: 0.2
                }
            );
        }

        videos.forEach((video, index) => {
            const inViewportNow = isElementInViewport(video, 0.08);
            const eagerCount = isConstrainedNetwork ? 0 : 1;
            const isPriority = isPostTransitionLoad ? inViewportNow : (inViewportNow || index < eagerCount);
            prepareVideo(video, isPriority);

            if (observer) {
                observer.observe(video);
            }

            if (isPriority && getVideoAutoplayManaged(video) && observer === null) {
                safePlay(video);
            }
        });

        if (!observer) {
            videos.forEach((video) => {
                if (getVideoAutoplayManaged(video) && isElementInViewport(video, 0.08)) {
                    safePlay(video);
                }
            });
        }

        if (!mediaLifecycleHandlersBound) {
            mediaLifecycleHandlersBound = true;

            document.addEventListener('visibilitychange', () => {
                const liveVideos = Array.from(document.querySelectorAll('video'));
                if (document.hidden) {
                    liveVideos.forEach((video) => {
                        if (getVideoAutoplayManaged(video)) {
                            video.pause();
                        }
                    });
                    return;
                }

                liveVideos.forEach((video) => {
                    if (getVideoAutoplayManaged(video) && isElementInViewport(video, 0.14)) {
                        safePlay(video);
                    }
                });
            });

            window.addEventListener('pagehide', () => {
                const liveVideos = Array.from(document.querySelectorAll('video'));
                liveVideos.forEach((video) => {
                    if (getVideoAutoplayManaged(video)) {
                        video.pause();
                    }
                });
            });
        }
    };

    initMediaPerformanceOptimizations();
    window.__portfolioVideoScriptRan = true;

    const forceVideoRevealFallback = () => {
        const videos = Array.from(document.querySelectorAll('video[data-autoplay="1"], video[data-autoplay-managed="1"]'));
        videos.forEach((video) => {
            const host = video.parentElement;
            if (host && host.nodeType === Node.ELEMENT_NODE) {
                host.classList.add('video-reveal-host');
                video.classList.add('cinematic-video');
                let overlay = null;
                try {
                    overlay = host.querySelector(':scope > .video-brown-overlay');
                } catch {
                    overlay = host.querySelector('.video-brown-overlay');
                }
                if (!overlay) {
                    overlay = document.createElement('span');
                    overlay.className = 'video-brown-overlay';
                    const frameNode = host.querySelector('.frame, .frame-vertical');
                    host.insertBefore(overlay, frameNode || host.firstChild);
                }
            }

            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('autoplay', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.autoplay = true;
            video.playsInline = true;
            video.webkitPlaysInline = true;
            if (video.preload === 'none') {
                video.preload = 'metadata';
                try {
                    video.load();
                } catch {}
            }

            const markReady = () => {
                video.classList.add('is-ready');
                if (host && host.nodeType === Node.ELEMENT_NODE) {
                    host.classList.add('video-ready');
                }
            };

            const clearFallbackTimer = () => {
                if (fallbackTimer !== null) {
                    window.clearTimeout(fallbackTimer);
                    fallbackTimer = null;
                }
            };

            const attempt = () => {
                video.play().catch(() => {});
            };

            const fallbackTimer = window.setTimeout(() => {
                markReady();
            }, 1800);

            if (video.readyState >= 2) {
                attempt();
                markReady();
                clearFallbackTimer();
            } else {
                const readyEvents = ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing'];
                readyEvents.forEach((eventName) => {
                    video.addEventListener(eventName, () => {
                        attempt();
                        markReady();
                        clearFallbackTimer();
                    }, { once: true });
                });
            }
        });
    };

    document.addEventListener('DOMContentLoaded', forceVideoRevealFallback);
    window.addEventListener('load', forceVideoRevealFallback);
    if (document.readyState !== 'loading') {
        forceVideoRevealFallback();
    }
    window.setTimeout(forceVideoRevealFallback, 600);
    window.setTimeout(forceVideoRevealFallback, 1200);
    window.setTimeout(forceVideoRevealFallback, 2200);

    const releaseHeldVideos = () => {
        body.classList.remove('transition-hold-videos');
        const liveVideos = Array.from(document.querySelectorAll('video'));
        liveVideos.forEach((video) => {
            if (getVideoAutoplayManaged(video) && isElementInViewport(video, 0.16)) {
                video.play().catch(() => {});
            }
        });
    };

    const initNavigationPrefetch = () => {
        const prefetched = new Set();
        const prefetchUrl = (href) => {
            if (!href || prefetched.has(href)) return;

            try {
                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin) return;

                const key = url.href;
                if (prefetched.has(key)) return;
                prefetched.add(key);

                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = key;
                link.as = 'document';
                document.head.appendChild(link);
            } catch {
                // Ignore invalid URLs.
            }
        };

        const anchors = Array.from(document.querySelectorAll('a[href]'));
        anchors.forEach((anchor) => {
            const href = anchor.getAttribute('href');
            if (!href || href.startsWith('#')) return;

            const triggerPrefetch = () => prefetchUrl(anchor.href);
            anchor.addEventListener('mouseenter', triggerPrefetch, { passive: true });
            anchor.addEventListener('focus', triggerPrefetch, { passive: true });
            anchor.addEventListener('touchstart', triggerPrefetch, { passive: true });
        });

        const homePieces = Array.from(document.querySelectorAll('.home-piece[data-href]'));
        homePieces.forEach((piece) => {
            const href = piece.getAttribute('data-href');
            if (!href) return;

            const triggerPrefetch = () => prefetchUrl(href);
            piece.addEventListener('mouseenter', triggerPrefetch, { passive: true });
            piece.addEventListener('focus', triggerPrefetch, { passive: true });
            piece.addEventListener('touchstart', triggerPrefetch, { passive: true });
        });

    };

    initNavigationPrefetch();

    const PAGE_TRANSITION_DIRECTION_KEY = 'pageSlideEnterSign';
    const PAGE_SLIDE_MS = 720;
    const PAGE_SLIDE_EASE = 'cubic-bezier(0.22, 0.84, 0.28, 1)';
    const PAGE_CINEMATIC_MS = 2000;
    const PAGE_CINEMATIC_TRAVEL_VW = 112;
    const PAGE_CINEMATIC_EASE = 'cubic-bezier(0.16, 0.88, 0.22, 1)';
    const PAGE_SHELL_ID = 'page-slide-shell';

    let hasNavigationStarted = false;

    const ensurePageShell = () => {
        const existing = document.getElementById(PAGE_SHELL_ID);
        if (existing) return existing;

        const shell = document.createElement('div');
        shell.id = PAGE_SHELL_ID;
        shell.style.position = 'relative';
        shell.style.minHeight = '100%';
        shell.style.willChange = 'transform';

        const nodesToMove = Array.from(body.childNodes).filter((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return true;
            if (node.nodeName === 'SCRIPT') return false;
            if (node.nodeName === 'HEADER') return false;
            return true;
        });

        nodesToMove.forEach((node) => shell.appendChild(node));

        const header = body.querySelector('header');
        const insertBeforeNode = header ? header.nextSibling : body.firstChild;
        body.insertBefore(shell, insertBeforeNode);
        return shell;
    };

    const pageShell = ensurePageShell();

    // Clean legacy key from older brown-curtain transition implementation.
    window.sessionStorage.removeItem('pageCurtainTransitionPending');

    const runPageEnterSlide = (enterSign) => {
        pageShell.style.transition = 'none';
        pageShell.style.transform = `translate3d(${enterSign * 100}vw, 0, 0)`;
        pageShell.style.opacity = '1';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pageShell.style.transition = `transform ${PAGE_SLIDE_MS}ms ${PAGE_SLIDE_EASE}`;
                pageShell.style.transform = 'translate3d(0, 0, 0)';

                window.setTimeout(() => {
                    pageShell.style.removeProperty('transition');
                    pageShell.style.removeProperty('will-change');
                    pageShell.style.removeProperty('transform');
                    pageShell.style.removeProperty('opacity');
                }, PAGE_SLIDE_MS + 40);
            });
        });
    };

    const shouldOpenWithSlide = window.sessionStorage.getItem(PAGE_TRANSITION_STORAGE_KEY) === '1';
    if (shouldOpenWithSlide) {
        const transitionMode = window.sessionStorage.getItem(PAGE_TRANSITION_MODE_KEY) || 'slide';
        window.sessionStorage.removeItem(PAGE_TRANSITION_STORAGE_KEY);
        window.sessionStorage.removeItem(PAGE_TRANSITION_MODE_KEY);
        const storedSign = Number.parseInt(window.sessionStorage.getItem(PAGE_TRANSITION_DIRECTION_KEY) || '1', 10);
        window.sessionStorage.removeItem(PAGE_TRANSITION_DIRECTION_KEY);
        if (transitionMode === 'slide') {
            const enterSign = storedSign === -1 ? -1 : 1;
            runPageEnterSlide(enterSign);
        }
    }

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            hasNavigationStarted = false;
            pageShell.style.removeProperty('transition');
            pageShell.style.removeProperty('transform');
            pageShell.style.removeProperty('opacity');
            pageShell.style.removeProperty('filter');
        }
    });

    window.addEventListener('pagehide', () => {
        hasNavigationStarted = false;
    });

    const isEligibleLink = (anchor) => {
        if (!anchor) return false;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#')) return false;
        if (anchor.target && anchor.target !== '_self') return false;
        if (anchor.hasAttribute('download')) return false;
        return true;
    };


    const navigateWithTransition = (url) => {
        if (hasNavigationStarted) return;

        hasNavigationStarted = true;
        body.classList.add('transition-hold-videos');

        const motion = resolveMenuMotion(url);
        const exitSign = motion ? motion.exitSign : -1;
        const enterSign = -exitSign;

        const fallbackSlideNavigate = () => {
            // Ultimate fallback: preserve navigation even if cinematic preloading fails.
            window.location.href = url.href;
        };

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) {
            fallbackSlideNavigate();
            return;
        }

        window.sessionStorage.setItem(PAGE_TRANSITION_STORAGE_KEY, '1');
        window.sessionStorage.setItem(PAGE_TRANSITION_MODE_KEY, 'cinematic');

        const completePjaxSwap = (incomingDoc) => {
            if (!incomingDoc?.body) {
                fallbackSlideNavigate();
                return;
            }

            const incomingRoot = incomingDoc.getElementById(PAGE_SHELL_ID) || incomingDoc.body;
            const incomingNodes = Array.from(incomingRoot.childNodes).filter((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return true;
                    if (node.nodeName === 'SCRIPT') return false;
                    if (node.nodeName === 'HEADER') return false;
                    return true;
            body.classList.add('transition-hold-videos');
            if (isSafari) {
                body.classList.add('safari-browser');
            }
            updateHeaderNavigation();

            pageShell.style.removeProperty('transition');
            pageShell.style.removeProperty('transform');
            pageShell.style.removeProperty('opacity');
            pageShell.style.removeProperty('filter');
            pageShell.style.removeProperty('will-change');
            body.style.removeProperty('pointer-events');

            const prettyHistoryHref = buildPrettyUrl(url) || url.href;
            history.pushState({ pjax: true }, '', prettyHistoryHref);

            initMediaPerformanceOptimizations();
            initNavigationPrefetch();
            setupGridGlowUnderlay();
            bindInlinePlayerFrameHandlers(document);

            window.setTimeout(() => {
                releaseHeldVideos();
            }, 760);

            const refreshedGlitchVideo = document.querySelector('source[src*="PUBLICIDADE_HORIZONTAL_11.mp4"]')?.parentElement;
            if (refreshedGlitchVideo instanceof HTMLVideoElement && refreshedGlitchVideo.dataset.glitchGuardBound !== '1') {
                refreshedGlitchVideo.dataset.glitchGuardBound = '1';
                const START_OFFSET = 0.12;
                const END_GUARD = 0.1;
                refreshedGlitchVideo.preload = 'auto';

                const snapToSafeStart = () => {
                    if (Number.isFinite(refreshedGlitchVideo.duration) && refreshedGlitchVideo.duration > START_OFFSET) {
                        refreshedGlitchVideo.currentTime = START_OFFSET;
                    }
                };

                refreshedGlitchVideo.addEventListener('loadeddata', snapToSafeStart);
                refreshedGlitchVideo.addEventListener('ended', snapToSafeStart);
                refreshedGlitchVideo.addEventListener('seeking', () => {
                    if (refreshedGlitchVideo.currentTime < START_OFFSET) {
                        refreshedGlitchVideo.currentTime = START_OFFSET;
                    }
                });
                refreshedGlitchVideo.addEventListener('timeupdate', () => {
                    if (!Number.isFinite(refreshedGlitchVideo.duration) || refreshedGlitchVideo.duration <= 0) return;
                    if (refreshedGlitchVideo.duration - refreshedGlitchVideo.currentTime < END_GUARD) {
                        refreshedGlitchVideo.currentTime = START_OFFSET;
                        if (refreshedGlitchVideo.paused) {
                            refreshedGlitchVideo.play().catch(() => {});
                        }
                    }
                });
            }

            hasNavigationStarted = false;
            window.sessionStorage.removeItem(PAGE_TRANSITION_STORAGE_KEY);
            window.sessionStorage.removeItem(PAGE_TRANSITION_MODE_KEY);
            window.sessionStorage.removeItem(PAGE_TRANSITION_DIRECTION_KEY);
        };

        const transitionLayer = document.createElement('div');
        transitionLayer.setAttribute('aria-hidden', 'true');
        transitionLayer.style.position = 'fixed';
        transitionLayer.style.inset = '0';
        transitionLayer.style.overflow = 'hidden';
        transitionLayer.style.pointerEvents = 'none';
        transitionLayer.style.zIndex = '2147483646';
        transitionLayer.style.background = 'transparent';
        transitionLayer.style.transform = 'translateZ(0)';

        const incomingFrame = document.createElement('iframe');
        incomingFrame.src = url.href;
        incomingFrame.setAttribute('title', 'incoming-page-preview');
        incomingFrame.setAttribute('aria-hidden', 'true');
        incomingFrame.setAttribute('allow', 'autoplay; fullscreen');
        incomingFrame.style.position = 'absolute';
        incomingFrame.style.inset = '0';
        incomingFrame.style.width = '100%';
        incomingFrame.style.height = '100%';
        incomingFrame.style.border = '0';
        incomingFrame.style.background = 'transparent';
        incomingFrame.style.visibility = 'hidden';
        incomingFrame.style.opacity = '0.02';
        incomingFrame.style.filter = 'blur(0.8px) saturate(0.98)';
        incomingFrame.style.transform = `translate3d(${enterSign * PAGE_CINEMATIC_TRAVEL_VW}vw, 0, 0) scale(1.01)`;
        incomingFrame.style.willChange = 'transform, opacity, filter';

        transitionLayer.appendChild(incomingFrame);
        body.appendChild(transitionLayer);

        let started = false;
        const clearLayer = () => {
            if (transitionLayer.parentElement) {
                transitionLayer.parentElement.removeChild(transitionLayer);
            }
        };

        const safetyFallback = window.setTimeout(() => {
            if (started) return;
            clearLayer();
            fallbackSlideNavigate();
        }, 4200);

        const prepareIncomingPreview = () => {
            try {
                const incomingDoc = incomingFrame.contentDocument;
                if (!incomingDoc) return;

                incomingDoc.body?.classList.add('transition-hold-videos');

                if (!incomingDoc.getElementById('transition-preview-shared-bg')) {
                    const style = incomingDoc.createElement('style');
                    style.id = 'transition-preview-shared-bg';
                    style.textContent = [
                        'html, body { background: transparent !important; }',
                        'body::before, body::after { display: none !important; }',
                        '#page-slide-shell { background: transparent !important; }'
                    ].join('');
                    incomingDoc.head.appendChild(style);
                }

                incomingDoc.querySelectorAll('video').forEach((video) => {
                    try {
                        video.muted = true;
                        video.defaultMuted = true;
                        video.preload = 'auto';
                        video.play().catch(() => {});
                    } catch {
                        // Ignore individual media warmup errors.
                    }
                });
            } catch {
                // Ignore cross-document access issues.
            }
        };

        const captureIncomingPreviewVideoState = () => {
            try {
                const incomingDoc = incomingFrame.contentDocument;
                if (!incomingDoc) return;

                const entries = {};
                incomingDoc.querySelectorAll('video').forEach((video) => {
                    const sourceEl = video.querySelector('source[src]');
                    const src = sourceEl?.getAttribute('src') || video.getAttribute('src');
                    if (!src) return;
                    if (!Number.isFinite(video.currentTime)) return;
                    entries[src] = video.currentTime;
                });

                window.sessionStorage.setItem(
                    PAGE_VIDEO_RESUME_STORAGE_KEY,
                    JSON.stringify({
                        pathname: new URL(url.href, window.location.href).pathname,
                        timestamp: Date.now(),
                        entries
                    })
                );
            } catch {
                // Ignore capture issues.
            }
        };

        const startCinematicSlide = () => {
            if (started) return;
            started = true;
            window.clearTimeout(safetyFallback);

            body.style.pointerEvents = 'none';
            incomingFrame.style.visibility = 'visible';
            incomingFrame.style.transition = [
                `transform ${PAGE_CINEMATIC_MS}ms ${PAGE_CINEMATIC_EASE} 140ms`,
                `opacity ${Math.max(620, PAGE_CINEMATIC_MS - 260)}ms ${PAGE_CINEMATIC_EASE} 140ms`,
                `filter ${Math.max(540, PAGE_CINEMATIC_MS - 260)}ms ease 140ms`
            ].join(', ');

            pageShell.style.willChange = 'transform, opacity';
            pageShell.style.transition = [
                `transform ${PAGE_CINEMATIC_MS}ms ${PAGE_CINEMATIC_EASE} 140ms`,
                `opacity ${Math.max(620, PAGE_CINEMATIC_MS - 260)}ms ${PAGE_CINEMATIC_EASE} 140ms`
            ].join(', ');

            requestAnimationFrame(() => {
                pageShell.style.transform = `translate3d(${exitSign * PAGE_CINEMATIC_TRAVEL_VW}vw, 0, 0) scale(0.994)`;
                pageShell.style.opacity = '0.34';

                incomingFrame.style.transform = 'translate3d(0, 0, 0) scale(1)';
                incomingFrame.style.opacity = '1';
                incomingFrame.style.filter = 'blur(0) saturate(1)';
            });

            window.setTimeout(() => {
                captureIncomingPreviewVideoState();
                try {
                    const incomingDoc = incomingFrame.contentDocument;
                    completePjaxSwap(incomingDoc);
                } catch {
                    fallbackSlideNavigate();
                } finally {
                    clearLayer();
                }
            }, Math.round(PAGE_CINEMATIC_MS * 0.8));
        };

        incomingFrame.addEventListener(
            'load',
            () => {
                prepareIncomingPreview();
                requestAnimationFrame(() => {
                    requestAnimationFrame(startCinematicSlide);
                });
            },
            { once: true }
        );

        incomingFrame.addEventListener(
            'error',
            () => {
                if (started) return;
                window.clearTimeout(safetyFallback);
                clearLayer();
                fallbackSlideNavigate();
            },
            { once: true }
        );
    };

    const normalizePathname = (pathname) => pathname.replace(/\/+$/, '').toLowerCase() || '/';

    const normalizeHomeFrameLinks = () => {
        const pageKey = toPageKey(window.location.pathname);
        if (pageKey !== 'index.html') return;

        const frame2 = document.querySelector('.home-piece--b');
        const frame3 = document.querySelector('.home-piece--c');

        if (frame2) {
            frame2.setAttribute('data-href', '/about');
            frame2.setAttribute('aria-label', 'About');
        }

        if (frame3) {
            frame3.setAttribute('data-href', '/commercials');
            frame3.setAttribute('aria-label', 'Commercials');
        }
    };

    const updateHeaderNavigation = () => {
        const currentKey = toPageKey(window.location.pathname);
        const anchors = document.querySelectorAll('header nav a[href]');
        anchors.forEach((anchor) => {
            try {
                const linkKey = toPageKey(new URL(anchor.href, window.location.href).pathname);
                anchor.classList.toggle('active', linkKey === currentKey);
            } catch {
                anchor.classList.remove('active');
            }
        });
    };

    const toPageKey = (pathname) => {
        const normalizedPath = normalizePathname(pathname);
        const segment = normalizedPath.split('/').pop() || '';
        if (!segment) return 'index.html';
        if (PAGE_BY_PRETTY_PATH[segment]) return PAGE_BY_PRETTY_PATH[segment];
        return segment;
    };

    const buildPrettyUrl = (inputUrl) => {
        let resolved;
        try {
            resolved = inputUrl instanceof URL ? inputUrl : new URL(String(inputUrl), window.location.href);
        } catch {
            return null;
        }

        const pageKey = toPageKey(resolved.pathname);
        const prettySegment = PRETTY_PATH_BY_PAGE[pageKey];
        if (!prettySegment) return resolved.href;

        const normalized = normalizePathname(resolved.pathname);
        const currentSegment = normalized.split('/').pop() || '';
        if (currentSegment === prettySegment) return resolved.href;

        const pageFilePattern = new RegExp(`/${pageKey.replace('.', '\\.')}$`, 'i');
        const basePath = pageFilePattern.test(resolved.pathname)
            ? resolved.pathname.replace(pageFilePattern, '/')
            : (resolved.pathname.endsWith('/') ? resolved.pathname : `${resolved.pathname}/`);

        const targetPath = `${basePath}${prettySegment}`.replace(/\/+$/g, '').replace(/\/+/g, '/');
        return `${resolved.origin}${targetPath}${resolved.search}${resolved.hash}`;
    };

    const applyPrettyUrl = () => {
        if (window.location.protocol === 'file:') return;

        const prettyHref = buildPrettyUrl(window.location.href);
        if (!prettyHref) return;

        const currentHref = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (prettyHref === currentHref) return;

        window.history.replaceState({}, '', prettyHref);
    };

    applyPrettyUrl();
    normalizeHomeFrameLinks();
    updateHeaderNavigation();

    const getPageOrder = (pathname) => MENU_PAGE_ORDER[toPageKey(pathname)] || null;

    const resolveMenuMotion = (targetUrl) => {
        const currentOrder = getPageOrder(window.location.pathname);
        const targetOrder = getPageOrder(targetUrl.pathname);
        if (!currentOrder || !targetOrder || currentOrder === targetOrder) return null;

        const movingRightInMenu = targetOrder > currentOrder;
        return {
            currentOrder,
            targetOrder,
            exitSign: movingRightInMenu ? -1 : 1
        };
    };

    document.addEventListener('click', (event) => {
        const clickable = event.target.closest('a, .home-piece[data-href]');
        if (!clickable) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        let url = null;
        if (clickable.matches('a')) {
            if (!isEligibleLink(clickable)) return;
            url = new URL(clickable.href, window.location.href);
        } else {
            const href = clickable.getAttribute('data-href');
            if (!href) return;
            url = new URL(href, window.location.href);
        }

        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        event.preventDefault();
        navigateWithTransition(url);
    });

    document.addEventListener('touchend', (event) => {
        if (!isMobileLikeViewport()) return;

        const anchor = event.target.closest('header nav a[href]');
        if (!anchor) return;
        if (!isEligibleLink(anchor)) return;

        let url;
        try {
            url = new URL(anchor.href, window.location.href);
        } catch {
            return;
        }

        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        event.preventDefault();
        navigateWithTransition(url);
    }, { passive: false });

    document.addEventListener('keydown', (event) => {
        const clickable = event.target.closest('.home-piece[data-href]');
        if (!clickable) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;

        const href = clickable.getAttribute('data-href');
        if (!href) return;

        event.preventDefault();
        navigateWithTransition(new URL(href, window.location.href));
    });

    // Skip first/last problematic frames on video 11 to avoid black flashes at loop boundaries.
    const glitchVideo = document.querySelector('source[src*="PUBLICIDADE_HORIZONTAL_11.mp4"]')?.parentElement;
    const setupGridGlowUnderlay = () => {
        const grids = Array.from(document.querySelectorAll('.grid, .vertical-grid, .home-puzzle'));

        grids.forEach((grid) => {
            if (grid.querySelector(':scope > .grid-glow-underlay')) return;

            if (window.getComputedStyle(grid).position === 'static') {
                grid.style.position = 'relative';
            }

            const underlay = document.createElement('div');
            underlay.className = 'grid-glow-underlay';
            grid.prepend(underlay);

            const frames = Array.from(grid.querySelectorAll('.quadro, .quadro-vertical, .home-piece'));
            if (!frames.length) return;

            const hideUnderlay = () => {
                underlay.classList.remove('active');
            };

            const showUnderlayFor = (frame) => {
                const gridRect = grid.getBoundingClientRect();
                const frameRect = frame.getBoundingClientRect();

                underlay.style.left = `${frameRect.left - gridRect.left}px`;
                underlay.style.top = `${frameRect.top - gridRect.top}px`;
                underlay.style.width = `${frameRect.width}px`;
                underlay.style.height = `${frameRect.height}px`;
                underlay.classList.add('active');
            };

            frames.forEach((frame) => {
                frame.addEventListener('mouseenter', () => {
                    showUnderlayFor(frame);
                });

                frame.addEventListener('mousemove', () => {
                    showUnderlayFor(frame);
                });

                frame.addEventListener('mouseleave', hideUnderlay);
            });

            grid.addEventListener('mouseleave', hideUnderlay);
        });
    };

    setupGridGlowUnderlay();

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

    const getMediaEmbed = (url) => {
        if (!url) return null;
        const normalizedUrl = String(url).trim();

        const vimeoMatch = normalizedUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
        if (vimeoMatch) {
            const id = vimeoMatch[1];
            return {
                provider: 'vimeo',
                id,
                embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&loop=1&muted=1&autopause=0&title=0&byline=0&portrait=0`
            };
        }

        const youtubeMatch = normalizedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i);
        if (youtubeMatch) {
            const id = youtubeMatch[1];
            return {
                provider: 'youtube',
                id,
                embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=1&rel=0&modestbranding=1&playsinline=1`
            };
        }

        return null;
    };

    const openExternalMedia = (mediaUrl) => {
        if (!mediaUrl) return;
        window.open(mediaUrl, '_blank', 'noopener,noreferrer');
    };

    const shouldOpenExternally = (item) => item?.getAttribute('data-open-external') === '1';

    const getHorizontalGrid = () => document.querySelector('.grid:not(.vertical-grid)');
    const getHorizontalItems = () => {
        const grid = getHorizontalGrid();
        if (!grid) return [];
        return Array.from(grid.querySelectorAll(':scope > .item')).filter((item) => item.querySelector('.quadro'));
    };
    const getVerticalItems = () => Array.from(document.querySelectorAll('.vertical-grid .vertical-item')).filter((item) => item.querySelector('.quadro-vertical'));

    const initCinematicArrowCursor = () => {
        const cursor = document.createElement('div');
        const clipId = `cinema-arrow-clip-${Math.random().toString(36).slice(2)}`;
        cursor.className = 'cinema-arrow-cursor';
        cursor.innerHTML = `
            <svg class="cinema-arrow-svg" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                <defs>
                    <clipPath id="${clipId}">
                        <path d="M5.5 2.5L24.5 14.2L15.8 15.8L21.4 28.8L15.9 31L10.2 18L5.5 25Z"></path>
                    </clipPath>
                </defs>
                <rect class="cinema-arrow-base" x="0" y="0" width="32" height="32" clip-path="url(#${clipId})"></rect>
                <rect class="cinema-arrow-overlay" x="0" y="0" width="32" height="32" clip-path="url(#${clipId})"></rect>
                <path class="cinema-arrow-outline" d="M5.5 2.5L24.5 14.2L15.8 15.8L21.4 28.8L15.9 31L10.2 18L5.5 25Z"></path>
            </svg>
        `;
        body.appendChild(cursor);
        body.classList.add('arrow-cursor-enabled');

        let targetX = -9999;
        let targetY = -9999;
        let pointerX = -9999;
        let pointerY = -9999;
        let hoveredTarget = null;
        let rafId = null;
        const HOTSPOT_X = 5;
        const HOTSPOT_Y = 3;

        const setFillProgress = (progress) => {
            cursor.style.setProperty('--arrow-fill-progress', String(progress));
        };

        const resolveInteractiveTarget = (x, y) => {
            const element = document.elementFromPoint(x, y);
            if (!element) return null;
            return element.closest('.quadro, .quadro-vertical, .vimeo-underframe, header nav a, .logo a, .logo img');
        };

        const updateHoveredTarget = (target) => {
            if (hoveredTarget === target) return;
            hoveredTarget = target;

            if (!hoveredTarget) {
                setFillProgress(0);
                cursor.classList.remove('visible');
                stopRender();
                return;
            }

            cursor.classList.add('visible');
            startRender();
            requestAnimationFrame(() => {
                if (hoveredTarget === target) {
                    setFillProgress(1);
                }
            });
        };

        const render = () => {
            pointerX += (targetX - pointerX) * 0.26;
            pointerY += (targetY - pointerY) * 0.26;
            cursor.style.transform = `translate3d(${pointerX - HOTSPOT_X}px, ${pointerY - HOTSPOT_Y}px, 0)`;

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

            if (pointerX < -9000 || pointerY < -9000) {
                pointerX = targetX;
                pointerY = targetY;
            }

            updateHoveredTarget(resolveInteractiveTarget(targetX, targetY));
        });

        document.addEventListener('mouseout', (event) => {
            if (event.relatedTarget) return;
            updateHoveredTarget(null);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopRender();
            } else if (hoveredTarget) {
                startRender();
            }
        });

        setFillProgress(0);
    };

    // Keep browser cursor behavior; custom arrow cursor disabled.

    const ZOOM_MODE_KEY = 'frameZoomAnimationsEnabled';
    const DEFAULT_VIMEO_ID = '1103764375';
    const DEFAULT_VIMEO_URL = `https://vimeo.com/${DEFAULT_VIMEO_ID}`;
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

    const openInlinePlayer = (quadro, sourceVideo, mediaUrl) => {
        if (!quadro || !sourceVideo) return;

        const media = getMediaEmbed(mediaUrl) || getMediaEmbed(DEFAULT_VIMEO_URL);
        if (!media) return;

        const iframe = document.createElement('iframe');
        iframe.className = 'vimeo-underframe';
        iframe.src = media.embedUrl;
        iframe.loading = 'eager';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        iframe.setAttribute('allowfullscreen', '');
        iframe.style.pointerEvents = 'auto';
        iframe.style.cursor = 'pointer';
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

    const bindInlinePlayerFrameHandlers = (root = document) => {
        const horizontalFrames = Array.from(root.querySelectorAll('.item .quadro'));
        horizontalFrames.forEach((frame) => {
            if (frame.dataset.inlinePlayerBound === '1') return;
            frame.dataset.inlinePlayerBound = '1';

            frame.addEventListener('click', (event) => {
                event.stopPropagation();
                resetAllInlinePlayers();

                const item = frame.closest('.item');
                const quadro = item?.querySelector('.quadro');
                const sourceVideo = quadro?.querySelector('video');
                if (!item || !quadro || !sourceVideo) return;

                const mediaUrl = item.getAttribute('data-vimeo-url') || DEFAULT_VIMEO_URL;
                if (shouldOpenExternally(item)) {
                    openExternalMedia(mediaUrl);
                    return;
                }

                openInlinePlayer(quadro, sourceVideo, mediaUrl);
            });
        });

        const verticalFrames = Array.from(root.querySelectorAll('.vertical-item .quadro-vertical'));
        verticalFrames.forEach((frame) => {
            if (frame.dataset.inlinePlayerBound === '1') return;
            frame.dataset.inlinePlayerBound = '1';

            frame.addEventListener('click', (event) => {
                event.stopPropagation();
                resetAllInlinePlayers();

                const item = frame.closest('.vertical-item');
                const quadro = item?.querySelector('.quadro-vertical');
                const sourceVideo = quadro?.querySelector('video');
                if (!item || !quadro || !sourceVideo) return;

                const mediaUrl = item.getAttribute('data-vimeo-url') || DEFAULT_VIMEO_URL;
                if (shouldOpenExternally(item)) {
                    openExternalMedia(mediaUrl);
                    return;
                }

                openInlinePlayer(quadro, sourceVideo, mediaUrl);
            });
        });
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
        });

        bindInlinePlayerFrameHandlers(document);

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

        const mediaUrl = item.getAttribute('data-vimeo-url') || DEFAULT_VIMEO_URL;
        const media = getMediaEmbed(mediaUrl);

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

        if (media) {
            const iframe = document.createElement('iframe');
            iframe.className = 'vimeo-underframe';
            iframe.src = media.embedUrl;
            iframe.loading = 'eager';
            iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
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