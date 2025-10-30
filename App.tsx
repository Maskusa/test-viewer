import React from 'react';
import { BookView } from './pages/BookView';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col font-sans">
      <header className="p-4 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl sm:text-2xl font-bold text-cyan-400 tracking-wider">
            Flowing Text Layout
          </h1>
        </div>
      </header>
      <BookView />
    </div>
  );
};

export default App;