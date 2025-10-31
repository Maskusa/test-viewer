import React, { useState, useRef, useLayoutEffect, useMemo, useEffect } from 'react';
import { Controls } from '../components/Controls';
import { TEXT_CONTENT } from '../constants';

const PADDING_Y_REM = 2; // Corresponds to Tailwind's p-8 -> 2rem if 1rem=16px
const PADDING_X_REM = 2.5; // Corresponds to Tailwind's px-10 -> 2.5rem

const remToPx = (rem: number) => {
  if (typeof window === 'undefined') return rem * 16;
  return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
};

// --- Debug helpers ---
const DEBUG_STRICT = true;          // можно подвязать на UI‑переключатель
const EPS = 1;                      // допуск по пикселям
const RUN_ID = Math.floor(Math.random() * 1e9);

const fmtPx = (n?: number) => n === undefined ? '—' : `${n.toFixed(2)}px`;
const elLabel = (el: Element) => {
  const t = (el as HTMLElement).tagName;
  const len = ((el.textContent || '').trim()).length;
  const cls = (el as HTMLElement).className?.split(/\s+/).filter(Boolean).slice(0,2).join('.') || '';
  return `${t}${cls ? '.'+cls : ''}[${len}ch]`;
};
const hash32 = (s: string) => { // небольшой хэш для быстрых сравнений
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
};


interface LineDebugInfo {
  top: number;
  left: number;
  width: number;
  height: number;
  isBad: boolean;
}

interface PageStatsInfo {
  totalLines: number;
  goodLines: number;
  badLines: number;
  emptyLines: number;
  viewerHeight: number;     // фактически отрисованная видимая часть (по расчёту)
  contentHeight: number;    // полная высота контента на странице до клипа
  availableHeight: number;  // доступная высота внутри viewer (без паддингов)
  overshootPx: number;      // сколько "налезли" сверх видимой области до клипа
  underfillPx: number;      // сколько не добрали до низа (подозрение на недозаполнение)
  pageNo: number;           // номер страницы (для удобства в логе)
  handoffNextOffset: number;// offset, который передали на след. страницу
  elementIndexStart: number;// индекс первого элемента, попавшего в страницу
  elementIndexEnd: number;  // индекс последнего элемента, попавшего в страницу (после отбрасывания хвоста)
  lastElement: string | null; // человекочитаемая метка последнего узла
  splitLast: boolean;       // резали ли последний узел на этой странице
  initialYOffset: number;
  globalStart: number;
  globalEnd: number;
}


interface PageContent {
  html: string;
  initialYOffset: number;
  debugLines: LineDebugInfo[];
  stats: PageStatsInfo;
}

const PageStats: React.FC<{ stats: PageStatsInfo, pageIndex: number }> = ({ stats, pageIndex }) => {
    const endPosition = stats.initialYOffset + stats.viewerHeight;
    return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg text-white text-xs p-2 font-mono grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between"><span>Total:</span><span>{stats.totalLines}</span></div>
            <div className="flex justify-between text-green-400"><span>Good:</span><span>{stats.goodLines}</span></div>
            <div className="flex justify-between text-red-400"><span>Bad:</span><span>{stats.badLines}</span></div>
            <div className="flex justify-between text-gray-400"><span>Empty:</span><span>{stats.emptyLines}</span></div>
            
            <div className="col-span-2 border-t border-gray-700 pt-1 mt-1"></div>
            
            <div className="flex justify-between"><span>Viewer H:</span><span>{stats.viewerHeight.toFixed(0)}px</span></div>
            <div className="flex justify-between"><span>Content H:</span><span id={`stats_content_h-${pageIndex}`}>{stats.contentHeight.toFixed(0)}px</span></div>

            {/* Renamed local range */}
            <div className="flex justify-between col-span-2">
                <span className="truncate mr-2">Slice in #content_h-{pageIndex}:</span>
                <span className="flex-shrink-0">{`${stats.initialYOffset.toFixed(0)} - ${endPosition.toFixed(0)}px`}</span>
            </div>

            {/* New global range */}
            <div className="flex justify-between col-span-2 font-bold text-cyan-300">
                <span>Global (doc):</span>
                <span>{`${stats.globalStart.toFixed(0)} - ${stats.globalEnd.toFixed(0)}px`}</span>
            </div>
            
            <div className="col-span-2 border-t border-gray-700 pt-1 mt-1"></div>

            {/* Diagnostic fields */}
            <div className="flex justify-between text-gray-400">
                <span className="truncate">handoffNextOffset:</span>
                <span>{stats.handoffNextOffset.toFixed(0)}px</span>
            </div>
            <div className="flex justify-between text-gray-400">
                <span>splitLast:</span>
                <span>{String(stats.splitLast)}</span>
            </div>
            <div className="flex justify-between col-span-2 text-gray-400">
                <span className="flex-shrink-0 mr-2">lastElement:</span>
                <span className="truncate text-right">{stats.lastElement ?? '—'}</span>
            </div>
        </div>
    );
};

const Page: React.FC<{
  content: PageContent;
  showDebugView: boolean;
  fontSize: number;
  pageIndex: number;
}> = React.memo(({ content, showDebugView, fontSize, pageIndex }) => {

  useEffect(() => {
    const viewer = document.getElementById(`viewer_h-${pageIndex}`);
    const contentEl = document.getElementById(`content_h-${pageIndex}`);
    if (!viewer || !contentEl) return;
  
    const vh = (viewer as HTMLElement).getBoundingClientRect().height;
    const ch = (contentEl as HTMLElement).getBoundingClientRect().height;
  
    // 1) главный инвариант — viewer < content
    const okViewerVsContent = vh < ch - EPS;
  
    // 2) сверка «ожидаемой» и фактической высоты viewer
    const deltaStatsVsDom = Math.abs(vh - content.stats.viewerHeight);
  
    const note = `[Post-Render Invariant] run#${RUN_ID} page ${pageIndex + 1}: viewer=${fmtPx(vh)} content=${fmtPx(ch)} ` +
                 `expectedViewer=${fmtPx(content.stats.viewerHeight)} Δ=${fmtPx(deltaStatsVsDom)} OK=${okViewerVsContent}`;
    if (!okViewerVsContent) {
      console.error(note, { pageIndex, dom: { viewer: vh, content: ch }, stats: content.stats });
    } else if (DEBUG_STRICT) {
      console.log(note);
    }
  }, [content.html, content.stats, pageIndex]);

  return (
    <div id={`viewer_h-${pageIndex}`} className="relative w-full" style={{ height: `${content.stats.viewerHeight}px`, overflow: 'hidden' }}>
        <div style={{ transform: `translateY(-${content.initialYOffset}px)` }}>
            <div
                id={`content_h-${pageIndex}`}
                className="prose prose-invert max-w-none prose-p:text-gray-300 prose-h1:text-cyan-400 prose-h2:text-cyan-300 prose-h3:text-cyan-200 prose-h4:text-gray-200"
                style={{ fontSize: `${fontSize}px` }}
                dangerouslySetInnerHTML={{ __html: content.html }}
            />
        </div>
      {showDebugView && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {content.debugLines.map((line, index) => (
                <div
                key={`debug-line-${index}`}
                className={`absolute ${line.isBad ? 'bg-red-500/30' : 'border border-green-500'}`}
                style={{
                    top: `${line.top}px`,
                    left: `${line.left}px`,
                    width: `${line.width}px`,
                    height: `${line.height}px`,
                }}
                />
            ))}
            </div>
      )}
    </div>
  );
});

export const BookView: React.FC = () => {
  const [blockWidth, setBlockWidth] = useState(500);
  const [blockHeight, setBlockHeight] = useState(440);
  const [fontSize, setFontSize] = useState(19);
  const [showDebugView, setShowDebugView] = useState(true);
  const [singlePageView, setSinglePageView] = useState(false);

  const [pages, setPages] = useState<PageContent[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [outgoingPage, setOutgoingPage] = useState<number | null>(null);
  const [animationDirection, setAnimationDirection] = useState<'forward' | 'backward' | null>(null);

  const measureRef = useRef<HTMLDivElement>(null);

  const sourceElements = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${TEXT_CONTENT.trim()}</div>`, "text/html");
    return Array.from(doc.body.firstElementChild!.children) as HTMLElement[];
  }, []);

  useLayoutEffect(() => {
    console.log(`%c[Layout Start] W:${blockWidth} H:${blockHeight} Font:${fontSize}`, 'color: #00FFFF; font-weight: bold;');
    if (!measureRef.current || sourceElements.length === 0) {
      console.warn('[Layout Abort] No measure ref or source elements.');
      return;
    }
    
    const pageContentContainer = measureRef.current;
    
    const sampleP = document.createElement('p');
    sampleP.style.visibility = 'hidden';
    sampleP.style.position = 'absolute';
    sampleP.textContent = 'X';
    sampleP.style.fontSize = `${fontSize}px`;
    pageContentContainer.appendChild(sampleP);
    const avgLineHeight = sampleP.offsetHeight > 0 ? sampleP.offsetHeight : fontSize * 1.5;
    pageContentContainer.removeChild(sampleP);
    
    pageContentContainer.innerHTML = '';

    const tempPageViewer = document.createElement('div');
    tempPageViewer.style.position = 'absolute';
    tempPageViewer.style.visibility = 'hidden';
    tempPageViewer.style.pointerEvents = 'none';
    tempPageViewer.style.height = `${blockHeight}px`;
    tempPageViewer.style.padding = `${remToPx(PADDING_Y_REM)}px ${remToPx(PADDING_X_REM)}px`;
    tempPageViewer.style.boxSizing = 'border-box';
    document.body.appendChild(tempPageViewer);

    const tempInnerViewer = document.createElement('div');
    tempInnerViewer.style.height = '100%';
    tempPageViewer.appendChild(tempInnerViewer);

    const availableTextHeight = tempInnerViewer.offsetHeight;
    
    document.body.removeChild(tempPageViewer);
    
    if (availableTextHeight <= 0) {
      console.error('[Layout Abort] availableTextHeight is 0 or less.');
      setPages([]);
      return;
    };

    const newPages: PageContent[] = [];
    let elementIndex = 0;
    let yOffsetForNextPage = 0;
    let globalOffset = 0; 

    while (elementIndex < sourceElements.length) {
        console.group(`%cSetting up Page ${newPages.length + 1}`, 'color: #FFA500; font-weight: bold;');
        const elementIndexStart = elementIndex; // фиксируем старт
        
        const initialYOffset = yOffsetForNextPage;
        console.log(`[Step 1: Initial State] Starting with yOffset: ${fmtPx(initialYOffset)} from previous page.`);
        pageContentContainer.innerHTML = '';
        
        let pageElements: (Node | HTMLElement)[];
        let lastMeasuredHeight: number;
        let advanceBy: number;
        let yOffsetOnNextPage = 0;

        if (initialYOffset > 0) {
            console.log(`[Step 2: Content Fill] Resuming page from element index ${elementIndex}.`);
            const resumed = sourceElements[elementIndex].cloneNode(true) as HTMLElement;
            pageContentContainer.appendChild(resumed);
            const nodes: HTMLElement[] = [resumed];
            let h = pageContentContainer.getBoundingClientRect().height;

            for (let i = elementIndex + 1; i < sourceElements.length; i++) {
                const next = sourceElements[i].cloneNode(true) as HTMLElement;
                pageContentContainer.appendChild(next);
                nodes.push(next);
                const newH = pageContentContainer.getBoundingClientRect().height;
                const visibleH = newH - initialYOffset;
                h = newH;
                if (visibleH > availableTextHeight + 1) {
                    break;
                }
            }
            pageElements = nodes;
            lastMeasuredHeight = h;
            advanceBy = nodes.length;
            console.log(`[Step 2: Content Fill] Added ${nodes.length} element(s) (1 resumed + ${nodes.length - 1} following). Final measured height: ${fmtPx(lastMeasuredHeight)}`);
        } else {
            console.log(`[Step 2: Content Fill] Starting fresh page from element index ${elementIndex}.`);
            const clonedForThisPage: HTMLElement[] = [];
            for (let i = elementIndex; i < sourceElements.length; i++) {
                const clone = sourceElements[i].cloneNode(true) as HTMLElement;
                pageContentContainer.appendChild(clone);
                clonedForThisPage.push(clone);
                lastMeasuredHeight = pageContentContainer.getBoundingClientRect().height;
                if (lastMeasuredHeight > availableTextHeight) break;
            }
            pageElements = clonedForThisPage; // ВАЖНО: работаем с КЛОНАМИ в контейнере
            advanceBy = clonedForThisPage.length;
            console.log(`[Step 2: Content Fill] Added ${advanceBy} cloned element(s) until overflow. Final measured height: ${fmtPx(lastMeasuredHeight)}`);
        }
        
        let finalPageHTML = pageElements.map(e => (e as HTMLElement).outerHTML).join('');
        let finalDebugLines: LineDebugInfo[] = [];
        let finalClipHeight: number | undefined = undefined;
        
        const displayedContentHeight = lastMeasuredHeight - initialYOffset;
        const isSplit = displayedContentHeight > availableTextHeight + 1;
        
        console.log(`[Step 3: Split Decision] Displayed content height (${fmtPx(displayedContentHeight)}) vs available height (${fmtPx(availableTextHeight)}). Page will be split: ${isSplit}.`);
        const overshootPx = Math.max(0, displayedContentHeight - availableTextHeight);

        if (isSplit) {
            const pageContainerRect = pageContentContainer.getBoundingClientRect();
            const allLines: LineDebugInfo[] = [];
             Array.from(pageContentContainer.children).forEach((el: Element) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const rects = Array.from(range.getClientRects());
                rects.forEach(lineRect => {
                    const lineTopInPage = (lineRect.top - pageContainerRect.top) - initialYOffset;
                     if (lineRect.width < 1 || lineRect.height < 1) return;
                    allLines.push({ top: lineTopInPage, left: lineRect.left - pageContainerRect.left, width: lineRect.width, height: lineRect.height, isBad: false });
                });
            });

            const goodLines = allLines.filter(l => (l.top + l.height) <= availableTextHeight + 1);

            if (goodLines.length > 0) {
                const lastGoodLine = goodLines[goodLines.length - 1];
                finalClipHeight = lastGoodLine.top + lastGoodLine.height;
                finalDebugLines = goodLines;

                const lastClone = pageElements[pageElements.length - 1] as HTMLElement;
                const canSplitLastElement = lastClone && !lastClone.tagName.startsWith('H');

                if(canSplitLastElement){
                    advanceBy -= 1;
                    const pageRect = pageContentContainer.getBoundingClientRect();
                    const lastElTopInPage = (lastClone.getBoundingClientRect().top - pageRect.top) - initialYOffset;
                    const consumedInsideLastEl = (finalClipHeight ?? 0) - lastElTopInPage;
                    yOffsetOnNextPage = Math.max(0, consumedInsideLastEl);
                } else {
                    finalPageHTML = (pageElements.slice(0, -1) as HTMLElement[]).map(e => e.outerHTML).join('');
                    const lastElementOnPage = pageElements[pageElements.length - 1] as HTMLElement;
                    
                    const lastElementRect = lastElementOnPage.getBoundingClientRect();
                    const pageContainerTop = pageContentContainer.getBoundingClientRect().top;
                    const lastElementTopInContainer = lastElementRect.top - pageContainerTop;

                    const remainingGoodLines = goodLines.filter(l => l.top < lastElementTopInContainer - initialYOffset);
                    
                    if (remainingGoodLines.length > 0) {
                        const newLastGoodLine = remainingGoodLines[remainingGoodLines.length - 1];
                        finalClipHeight = newLastGoodLine.top + newLastGoodLine.height;
                        finalDebugLines = remainingGoodLines;
                    } else {
                        finalClipHeight = 0;
                        finalDebugLines = [];
                    }
                    yOffsetOnNextPage = 0;
                    advanceBy -= 1;
                }
            } else {
                 yOffsetForNextPage = 0;
                 elementIndex += pageElements.length > 0 ? pageElements.length : 1;
                 console.groupEnd();
                 continue;
            }
        } else {
            const pageContainerRect = pageContentContainer.getBoundingClientRect();
            const allLines: LineDebugInfo[] = [];
             Array.from(pageContentContainer.children).forEach((el: Element) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const rects = Array.from(range.getClientRects());
                rects.forEach(lineRect => {
                    if (lineRect.width < 1 || lineRect.height < 1) return;
                    allLines.push({
                        top: (lineRect.top - pageContainerRect.top) - initialYOffset,
                        left: lineRect.left - pageContainerRect.left,
                        width: lineRect.width, height: lineRect.height, isBad: false
                    });
                });
            });
            finalDebugLines = allLines.filter(l => (l.top + l.height) > 0.1 && l.top < availableTextHeight);
        }
        
        const goodLinesCount = finalDebugLines.length;

        if(finalPageHTML.trim() !== '' || newPages.length === 0) {
            const viewerHeightForStats =
                finalClipHeight !== undefined ? finalClipHeight : displayedContentHeight;
            
            console.groupCollapsed('[Step 4: Position & Stats Calculation]');
            console.log(`- Initial Offset: ${fmtPx(initialYOffset)}`);
            if (isSplit) {
                console.log(`- Page was split. Using calculated clip height: ${fmtPx(finalClipHeight)}`);
            } else {
                console.log(`- Page was not split. Using displayed content height: ${fmtPx(displayedContentHeight)}`);
            }
            console.log(`- Final Viewer Height for stats: ${fmtPx(viewerHeightForStats)}`);
            const endPosition = initialYOffset + viewerHeightForStats;
            console.log(`%c- Calculated Position: ${initialYOffset.toFixed(0)}px - ${endPosition.toFixed(0)}px`, 'font-weight: bold; color: #90EE90;');
            console.groupEnd();

            let totalLinesForStats = Math.max(0, Math.floor(viewerHeightForStats / avgLineHeight));
            if (goodLinesCount > totalLinesForStats) totalLinesForStats = goodLinesCount;

            const lastEl = (pageElements[pageElements.length - 1] as HTMLElement | undefined) || null;
            const canSplitLastEl = lastEl ? !lastEl.tagName.startsWith('H') : false;

            const statsForPage: PageStatsInfo = {
                totalLines: totalLinesForStats,
                goodLines: goodLinesCount, badLines: 0,
                emptyLines: Math.max(0, totalLinesForStats - goodLinesCount),
                viewerHeight: viewerHeightForStats,
                contentHeight: lastMeasuredHeight,
                availableHeight: availableTextHeight,
                overshootPx,
                underfillPx: Math.max(0, availableTextHeight - viewerHeightForStats),
                pageNo: newPages.length + 1,
                handoffNextOffset: yOffsetOnNextPage,
                elementIndexStart,
                elementIndexEnd: elementIndexStart + advanceBy - 1,
                lastElement: lastEl ? elLabel(lastEl) : null,
                splitLast: !!(isSplit && canSplitLastEl),
                initialYOffset: initialYOffset,
                globalStart: globalOffset,
                globalEnd: globalOffset + viewerHeightForStats,
            };
             
             const pageToPush: PageContent = {
                html: finalPageHTML,
                initialYOffset: initialYOffset,
                debugLines: finalDebugLines,
                stats: statsForPage,
            };
            newPages.push(pageToPush);
            globalOffset += viewerHeightForStats;
        }
        
        yOffsetForNextPage = yOffsetOnNextPage;
        elementIndex += advanceBy;
        console.log(`[Step 5: Handoff] Preparing for next page. Next yOffset will be ${fmtPx(yOffsetForNextPage)}. Next element index will be ${elementIndex}.`);
        console.groupEnd();
    }

    setPages(newPages);
  }, [blockWidth, blockHeight, fontSize, sourceElements]);

  useEffect(() => {
    if (currentPage >= pages.length && pages.length > 0) {
      setCurrentPage(pages.length - 1);
    } else if (pages.length > 0 && currentPage < 0) {
      setCurrentPage(0);
    }
  }, [pages, currentPage]);

  const handleTurnPage = (direction: 'next' | 'prev') => {
    if (outgoingPage !== null) return; // Prevent new animation while one is in progress

    const newPage = direction === 'next'
      ? Math.min(currentPage + 1, pages.length - 1)
      : Math.max(0, currentPage - 1);

    if (newPage !== currentPage) {
      setAnimationDirection(direction === 'next' ? 'forward' : 'backward');
      setOutgoingPage(currentPage);
      setCurrentPage(newPage);

      setTimeout(() => {
        setOutgoingPage(null);
        setAnimationDirection(null);
      }, 500); // Must match animation duration
    }
  };
  
  const totalPages = pages.length;
  const currentPageDisplay = currentPage + 1;
  const STATS_HEIGHT = 148; // Adjusted height for the stats component

  const renderSinglePage = (pageIndex: number) => {
    const pageContent = pages[pageIndex];
    if (!pageContent) {
        return (
            <div style={{ width: blockWidth, visibility: 'hidden' }}>
                <div style={{height: `${STATS_HEIGHT}px`}} />
                <div className="page w-full" style={{height: blockHeight}} />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4" style={{ width: blockWidth }}>
             {showDebugView ? <PageStats stats={pageContent.stats} pageIndex={pageIndex} /> : <div style={{height: `${STATS_HEIGHT}px`}} />}
            <div className="page w-full bg-gray-800 shadow-lg rounded-lg border border-gray-700 overflow-hidden" style={{height: blockHeight}}>
              <div className="page_viewer relative w-full h-full" style={{padding: `${remToPx(PADDING_Y_REM)}px ${remToPx(PADDING_X_REM)}px`}}>
                <Page content={pageContent} showDebugView={showDebugView} fontSize={fontSize} pageIndex={pageIndex} />
              </div>
            </div>
        </div>
    );
  }

  const renderPageSet = (pageIndex: number, isOutgoing: boolean) => {
    if (pageIndex < 0 || pageIndex >= pages.length) return null;

    let animationClasses = '';
    if (isOutgoing) {
        animationClasses = animationDirection === 'forward'
            ? 'animate-slide-out-left'
            : 'animate-slide-out-right';
    }

    const prevIndex = pageIndex > 0 ? pageIndex - 1 : -1;
    const nextIndex = pageIndex < pages.length - 1 ? pageIndex + 1 : -1;

    return (
        <div className={`absolute top-0 left-0 w-full flex justify-center items-start gap-8 ${animationClasses}`} style={{ zIndex: isOutgoing ? 20 : 10 }}>
            <div className={singlePageView ? 'hidden' : ''}>
                {renderSinglePage(prevIndex)}
            </div>
            <div>
                {renderSinglePage(pageIndex)}
            </div>
            <div className={singlePageView ? 'hidden' : ''}>
                {renderSinglePage(nextIndex)}
            </div>
        </div>
    );
  };


  return (
    <main className="flex-grow flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-8">
      <aside className="w-full lg:w-72 lg:flex-shrink-0">
        <Controls
          width={blockWidth} setWidth={setBlockWidth} height={blockHeight} setHeight={setBlockHeight}
          fontSize={fontSize} setFontSize={setFontSize} showDebugView={showDebugView} setShowDebugView={setShowDebugView}
          singlePageView={singlePageView} setSinglePageView={setSinglePageView}
        />
      </aside>
      <div className="flex-grow flex flex-col items-center justify-center relative">
        <div className="relative" style={{ 
            width: singlePageView ? blockWidth : `${blockWidth * 3 + 32 * 2}px`, 
            height: `${blockHeight + STATS_HEIGHT + 16}px`,
            transition: 'width 0.3s ease-in-out',
        }}>
            {pages.length > 0 && renderPageSet(currentPage, false)}
            {outgoingPage !== null && renderPageSet(outgoingPage, true)}
        </div>

        <div className="flex items-center justify-center mt-6 w-full max-w-md">
          <button onClick={() => handleTurnPage('prev')} disabled={currentPage === 0} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white disabled:text-gray-600 disabled:bg-transparent transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="font-mono text-center text-sm text-gray-500 w-28">Page {currentPageDisplay} / {totalPages}</span>
          <button onClick={() => handleTurnPage('next')} disabled={currentPage + 1 >= pages.length} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white disabled:text-gray-600 disabled:bg-transparent transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', zIndex: -1, pointerEvents: 'none' }}>
          <div ref={measureRef} className="prose prose-invert" style={{ width: `${blockWidth > 0 ? blockWidth - remToPx(PADDING_X_REM) * 2 : 0}px`, fontSize: `${fontSize}px` }}/>
        </div>
      </div>
    </main>
  );
};