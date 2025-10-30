
import React, { useState } from 'react';
import { Controls } from '../components/Controls';
import { TEXT_CONTENT } from '../constants';

export const ColumnsView: React.FC = () => {
  const [blockWidth, setBlockWidth] = useState<number>(300);
  const [blockHeight, setBlockHeight] = useState<number>(400);
  const [fontSize, setFontSize] = useState<number>(16);

  const columnGap = 32; // 2rem in pixels (1rem = 16px)

  return (
    <main className="flex-grow flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-8">
      <aside className="w-full lg:w-72 lg:flex-shrink-0">
         <Controls
          width={blockWidth}
          setWidth={setBlockWidth}
          height={blockHeight}
          setHeight={setBlockHeight}
          fontSize={fontSize}
          setFontSize={setFontSize}
        />
      </aside>
      
      <div className="flex-grow flex items-center justify-center overflow-x-auto">
          <div
              className="p-1"
              style={{
                  width: `${(4 * blockWidth) + (3 * columnGap)}px`,
              }}
          >
              <div
                  className="text-justify leading-relaxed transition-all duration-200"
                  style={{
                      height: `${blockHeight}px`,
                      fontSize: `${fontSize}px`,
                      columns: `${blockWidth}px 4`,
                      columnGap: `${columnGap}px`,
                      columnRule: `1px solid #4A5568`, // gray-700
                  }}
              >
                  <div 
                    className="prose prose-invert max-w-none prose-p:text-gray-300 prose-h1:text-cyan-400 prose-h2:text-cyan-300 prose-h3:text-cyan-200 prose-h4:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: TEXT_CONTENT.replace(/\n/g, '<br/><br/>') }} 
                  />
              </div>
          </div>
      </div>
    </main>
  );
};
