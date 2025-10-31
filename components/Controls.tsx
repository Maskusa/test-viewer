import React from 'react';

interface ControlsProps {
  width: number;
  setWidth: (value: number) => void;
  height: number;
  setHeight: (value: number) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  showDebugView?: boolean;
  setShowDebugView?: (value: boolean) => void;
  singlePageView?: boolean;
  setSinglePageView?: (value: boolean) => void;
}

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, value, min, max, step, unit, onChange }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-baseline">
      <label className="text-sm font-medium text-gray-400">{label}</label>
      <span className="text-cyan-400 font-mono bg-gray-700/50 px-2 py-1 rounded text-sm">
        {value}{unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
    />
  </div>
);

const Toggle: React.FC<{
    label: string;
    enabled: boolean;
    onChange: () => void;
}> = ({ label, enabled, onChange }) => (
    <div className="flex items-center justify-between">
        <label htmlFor="debug-toggle" className="text-sm font-medium text-gray-400">
            {label}
        </label>
        <button
            id="debug-toggle"
            role="switch"
            aria-checked={enabled}
            onClick={onChange}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 ${
                enabled ? 'bg-cyan-600' : 'bg-gray-600'
            }`}
        >
            <span className="sr-only">Enable</span>
            <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
                enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    </div>
);


export const Controls: React.FC<ControlsProps> = ({
  width,
  setWidth,
  height,
  setHeight,
  fontSize,
  setFontSize,
  showDebugView,
  setShowDebugView,
  singlePageView,
  setSinglePageView,
}) => {
  return (
    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-6 sticky top-24">
      <h2 className="text-lg font-semibold text-white border-b border-gray-600 pb-3">
        Layout Controls
      </h2>
      <Slider
        label="Page Width"
        value={width}
        min={250}
        max={800}
        step={1}
        unit="px"
        onChange={(e) => setWidth(Number(e.target.value))}
      />
      <Slider
        label="Page Height"
        value={height}
        min={300}
        max={1000}
        step={1}
        unit="px"
        onChange={(e) => setHeight(Number(e.target.value))}
      />
      <Slider
        label="Font Size"
        value={fontSize}
        min={8}
        max={32}
        step={1}
        unit="px"
        onChange={(e) => setFontSize(Number(e.target.value))}
      />
      {(showDebugView !== undefined || singlePageView !== undefined) && (
         <div className="border-t border-gray-700 pt-6 space-y-4">
            {showDebugView !== undefined && setShowDebugView && (
                <Toggle
                    label="Show Line Colliders"
                    enabled={showDebugView}
                    onChange={() => setShowDebugView(!showDebugView)}
                />
            )}
            {singlePageView !== undefined && setSinglePageView && (
                <Toggle
                    label="Single Page View"
                    enabled={singlePageView}
                    onChange={() => setSinglePageView(!singlePageView)}
                />
            )}
        </div>
      )}
    </div>
  );
};
