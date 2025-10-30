import React, { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { Controls } from '../components/Controls';
import { TEXT_CONTENT } from '../constants';

const PADDING_Y_REM = 2; // Corresponds to Tailwind's p-8 -> 2rem if 1rem=16px
const PADDING_X_REM = 2.5; // Corresponds to Tailwind's px-10 -> 2.5rem

const remToPx = (rem: number) => {
  if (typeof window === 'undefined') return rem * 16;
  return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
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
    viewerHeight: number;
    contentHeight: number;
}

interface PageContent {
  html: string;
  initialYOffset: number;
  debugLines: LineDebugInfo[];
  stats: PageStatsInfo;
}

const PageStats: React.FC<{ stats: PageStatsInfo }> = ({ stats }) => {
    console.log('[PageStats] Rendering with stats:', stats);
    return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg text-white text-xs p-2 font-mono grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex justify-between"><span>Total:</span><span>{stats.totalLines}</span></div>
        <div className="flex justify-between text-green-400"><span>Good:</span><span>{stats.goodLines}</span></div>
        <div className="flex justify-between text-red-400"><span>Bad:</span><span>{stats.badLines}</span></div>
        <div className="flex justify-between text-gray-400"><span>Empty:</span><span>{stats.emptyLines}</span></div>
        <div className="col-span-2 border-t border-gray-700 pt-1 mt-1"></div>
        <div className="flex justify-between"><span>Viewer H:</span><span>{stats.viewerHeight.toFixed(0)}px</span></div>
        <div className="flex justify-between"><span>Content H:</span><span id="content_h">{stats.contentHeight.toFixed(0)}px</span></div>
        </div>
    );
};

const Page: React.FC<{
  content: PageContent;
  showDebugView: boolean;
  fontSize: number;
  pageIndex: number;
}> = React.memo(({ content, showDebugView, fontSize, pageIndex }) => {
  console.log(`[Page Component] Rendering page ${pageIndex} with viewerHeight: ${content.stats.viewerHeight}px`);
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

  const [pages, setPages] = useState<PageContent[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

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
    console.log(`[Layout Calc] Available Text Height: ${availableTextHeight.toFixed(2)}px`);

    const newPages: PageContent[] = [];
    let elementIndex = 0;
    let yOffsetForNextPage = 0;

    while (elementIndex < sourceElements.length) {
        console.group(`%c[Page ${newPages.length + 1}]`, 'color: #00FF00; font-weight: bold;');
        
        const initialYOffset = yOffsetForNextPage;
        pageContentContainer.innerHTML = '';
        
        let pageElements: (Node | HTMLElement)[];
        let lastMeasuredHeight: number;
        let advanceBy: number;
        let yOffsetOnNextPage = 0;

        if (initialYOffset > 0) {
            console.log(`-> Resuming split element at index ${elementIndex} with offset ${initialYOffset.toFixed(2)}px`);
            const elementToContinue = sourceElements[elementIndex].cloneNode(true);
            pageContentContainer.appendChild(elementToContinue);
            pageElements = [elementToContinue];
            lastMeasuredHeight = pageContentContainer.getBoundingClientRect().height;
            advanceBy = 1;
            yOffsetOnNextPage = 0; // Next page starts fresh
            console.log(`Added 1 resumed element. Measured height: ${lastMeasuredHeight.toFixed(2)}px`);
        } else {
            console.log(`-> Starting fresh page with elementIndex: ${elementIndex}`);
            let pageElementsCount = 0;
            for (let i = elementIndex; i < sourceElements.length; i++) {
                pageContentContainer.appendChild(sourceElements[i].cloneNode(true));
                lastMeasuredHeight = pageContentContainer.getBoundingClientRect().height;
                pageElementsCount = (i - elementIndex) + 1;
                if (lastMeasuredHeight > availableTextHeight) {
                    break;
                }
            }
            console.log(`Added ${pageElementsCount} elements. Measured height: ${lastMeasuredHeight.toFixed(2)}px`);
            pageElements = sourceElements.slice(elementIndex, elementIndex + pageElementsCount);
            advanceBy = pageElementsCount;
        }
        
        let finalPageHTML = pageElements.map(e => (e as HTMLElement).outerHTML).join('');
        let finalDebugLines: LineDebugInfo[] = [];
        let finalClipHeight: number | undefined = undefined;
        let displayedContentHeight = lastMeasuredHeight - initialYOffset;
        
        const isSplit = (lastMeasuredHeight - initialYOffset) > availableTextHeight + 1;
        console.log(`Page isSplit: ${isSplit}`);

        if (isSplit) {
            console.log('-> Splitting page content');
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
            console.log(`Found ${allLines.length} total lines, ${goodLines.length} good lines.`);

            if (goodLines.length > 0) {
                const lastGoodLine = goodLines[goodLines.length - 1];
                finalClipHeight = lastGoodLine.top + lastGoodLine.height;
                finalDebugLines = goodLines;
                yOffsetOnNextPage = initialYOffset + finalClipHeight;
                console.log(`Calculated clipHeight: ${finalClipHeight.toFixed(2)}px`);
                
                const lastElementOnPage = pageElements[pageElements.length - 1] as HTMLElement;
                const canSplitLastElement = lastElementOnPage && !lastElementOnPage.tagName.startsWith('H');
                console.log(`Last element (${lastElementOnPage?.tagName}) can be split: ${canSplitLastElement}`);
                
                if(canSplitLastElement){
                    advanceBy -= 1;
                    console.log(`-> Will split last element. New advanceBy: ${advanceBy}`);
                } else {
                    finalPageHTML = (pageElements.slice(0, -1) as HTMLElement[]).map(e => e.outerHTML).join('');
                    const remainingGoodLines = goodLines.slice(0, goodLines.findIndex(l => l.top >= (lastElementOnPage as any).offsetTop - initialYOffset));
                    if (remainingGoodLines.length > 0) {
                        const newLastGoodLine = remainingGoodLines[remainingGoodLines.length - 1];
                        finalClipHeight = newLastGoodLine.top + newLastGoodLine.height;
                        finalDebugLines = remainingGoodLines;
                    } else {
                        finalClipHeight = 0; // Page becomes empty
                        finalDebugLines = [];
                    }
                    yOffsetOnNextPage = 0;
                    advanceBy -= 1;
                    console.log(`-> Last element cannot be split. Removing it. New advanceBy: ${advanceBy}. Next page offset reset to 0. Recalculated clipHeight: ${finalClipHeight.toFixed(2)}px`);
                }
            } else {
                 console.warn('-> No good lines fit on this page. Skipping page creation and moving element(s) to the next.');
                 yOffsetForNextPage = 0;
                 elementIndex += pageElements.length > 0 ? pageElements.length : 1;
                 console.groupEnd();
                 continue;
            }
        } else {
            console.log('-> Page content fits completely.');
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
            console.log(`-> Content fits. Found ${allLines.length} total lines in content, filtered to ${finalDebugLines.length} visible lines.`);
        }
        
        const goodLinesCount = finalDebugLines.length;
        
        if(goodLinesCount === 0 && newPages.length > 0){
             console.warn('-> No visible lines calculated. This would create an empty page. Skipping.');
             yOffsetForNextPage = 0;
             elementIndex += advanceBy;
             console.groupEnd();
             continue;
        }

        if(finalPageHTML.trim() !== '' || newPages.length === 0) {
            const viewerHeightForStats = finalClipHeight !== undefined ? finalClipHeight : displayedContentHeight;
            
            let totalLinesForStats = Math.max(0, Math.floor(viewerHeightForStats / avgLineHeight));
            
            console.log(`-> Calculating Total Lines: floor(${viewerHeightForStats.toFixed(2)} / ${avgLineHeight.toFixed(2)}) = ${totalLinesForStats}`);
            
            // FIX: The average calculation can be wrong. If we measured more good lines than the total, adjust the total.
            if (goodLinesCount > totalLinesForStats) {
                console.warn(`-> Adjusting totalLines (${totalLinesForStats}) to match goodLines (${goodLinesCount}) because average calculation was inaccurate.`);
                totalLinesForStats = goodLinesCount;
            }

            const statsForPage: PageStatsInfo = {
                totalLines: totalLinesForStats,
                goodLines: goodLinesCount, badLines: 0,
                emptyLines: Math.max(0, totalLinesForStats - goodLinesCount),
                viewerHeight: viewerHeightForStats,
                contentHeight: lastMeasuredHeight,
            };

            console.log('-> Preparing stats for push:', {
                isSplit,
                finalClipHeight,
                displayedContentHeight,
                totalContentHeightForPage: lastMeasuredHeight,
                calculatedStats: statsForPage
            });
             
             const pageToPush: PageContent = {
                html: finalPageHTML,
                initialYOffset: initialYOffset,
                debugLines: finalDebugLines,
                stats: statsForPage,
            };
            console.log('Pushing new page object:');
            console.dir(pageToPush);
            newPages.push(pageToPush);
        } else {
            console.warn('Skipping empty page creation.');
        }
        
        yOffsetForNextPage = yOffsetOnNextPage;
        elementIndex += advanceBy;
        
        console.log(`Ending loop with elementIndex: ${elementIndex}, next page yOffset: ${yOffsetForNextPage.toFixed(2)}`);
        console.groupEnd();
    }

    console.log(`%c[Layout End] Created ${newPages.length} pages.`, 'color: #00FFFF; font-weight: bold;');
    setPages(newPages);
    if (currentPage >= newPages.length) {
      setCurrentPage(Math.max(0, newPages.length > 0 ? newPages.length - (newPages.length % 4 || 4) : 0));
    }
  }, [blockWidth, blockHeight, fontSize, sourceElements, currentPage]);

  const handleTurnPage = (direction: 'next' | 'prev') => {
    setCurrentPage(p => direction === 'next' ? Math.min(p + 4, pages.length - (pages.length % 4 || 4)) : Math.max(0, p - 4));
  };
  
  const totalSpreads = Math.ceil(pages.length / 4);
  const currentSpread = Math.floor(currentPage / 4) + 1;

  const renderPage = (pageIndex: number) => {
    const pageContent = pages[pageIndex];
     if(pageContent) {
        console.log(`[Render] Rendering pageIndex ${pageIndex}.`);
        console.dir(pageContent);
     }
    return (
        <div className="flex flex-col gap-4" style={{ width: blockWidth }}>
             {showDebugView && pageContent ? <PageStats stats={pageContent.stats} /> : <div className="h-[70px]" />}
            <div className="page w-full bg-gray-800 shadow-lg rounded-lg border border-gray-700 overflow-hidden" style={{height: blockHeight}}>
              <div className="page_viewer relative w-full h-full" style={{padding: `${remToPx(PADDING_Y_REM)}px ${remToPx(PADDING_X_REM)}px`}}>
                {pageContent ? <Page content={pageContent} showDebugView={showDebugView} fontSize={fontSize} pageIndex={pageIndex} /> : (
                     <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-24 h-24 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.546-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     </div>
                )}
              </div>
            </div>
        </div>
    );
  }

  return (
    <main className="flex-grow flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-8">
      <aside className="w-full lg:w-72 lg:flex-shrink-0">
        <Controls
          width={blockWidth} setWidth={setBlockWidth} height={blockHeight} setHeight={setBlockHeight}
          fontSize={fontSize} setFontSize={setFontSize} showDebugView={showDebugView} setShowDebugView={setShowDebugView}
        />
      </aside>
      <div className="flex-grow flex flex-col items-center justify-center relative">
        <div className="relative transition-all duration-200 flex justify-center items-start gap-8" style={{ width: `${blockWidth * 4 + 96}px` }}>
          {renderPage(currentPage)} {renderPage(currentPage + 1)} {renderPage(currentPage + 2)} {renderPage(currentPage + 3)}
        </div>
        <div className="flex items-center justify-center mt-6 w-full max-w-md">
          <button onClick={() => handleTurnPage('prev')} disabled={currentPage === 0} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white disabled:text-gray-600 disabled:bg-transparent transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="font-mono text-center text-sm text-gray-500 w-28">Spread {currentSpread} / {totalSpreads}</span>
          <button onClick={() => handleTurnPage('next')} disabled={currentPage + 4 >= pages.length} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white disabled:text-gray-600 disabled:bg-transparent transition-colors">
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