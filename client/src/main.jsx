import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, Theme } from '@yunex/yds-react';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
	<ThemeProvider defaultTheme={Theme.Light}>
		<App />
	</ThemeProvider>
);
