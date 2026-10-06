import { useState } from 'react';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import Toolbar from '@mui/material/Toolbar';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { purple } from '@mui/material/colors';
import TopNav from './TopNav';
import NavDrawer from './NavDrawer';
import HomePage from './pages/HomePage';
import PdfToEpubPage from './pages/PdfToEpubPage';
import type { View } from './views';

const theme = createTheme({
  colorSchemes: {
    light: { palette: { primary: { main: purple[900] } } },
    dark: { palette: { primary: { main: purple[200] } } },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          variants: [
            {
              props: { variant: 'contained', color: 'primary' },
              style: theme.applyStyles('dark', {
                backgroundColor: purple[900],
                color: theme.palette.common.white,
                '&:hover': { backgroundColor: purple[800] },
              }),
            },
          ],
        }),
      },
    },
  },
});

export default function App() {
  const [view, setView] = useState<View>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);

  function navigate(next: View) {
    setView(next);
    setDrawerOpen(false);
  }

  return(
    <ThemeProvider theme={theme} defaultMode="dark">
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        <TopNav drawerOpen={drawerOpen} onMenuClick={() => setDrawerOpen((open) => !open)} />
        <NavDrawer open={drawerOpen} currentView={view} onNavigate={navigate} />
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          {}
          <Toolbar />
          {view === 'home' && <HomePage />}
          {view === 'pdf-to-epub' && <PdfToEpubPage />}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
