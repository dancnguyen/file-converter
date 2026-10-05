import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme } from '@mui/material/styles';
import { purple } from '@mui/material/colors';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import MenuIcon from '@mui/icons-material/Menu';

type TopNavProps = {
  drawerOpen: boolean;
  onMenuClick: () => void;
};

export default function TopNav({ drawerOpen, onMenuClick }: TopNavProps) {
  const { mode, setMode } = useColorScheme();
  const isDark = mode !== 'light';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <AppBar
      position="fixed"
      sx={(theme) => ({ bgcolor: purple[900], color: 'common.white', backgroundImage: 'none', zIndex: theme.zIndex.drawer + 1 })}
    >
      <Toolbar>
        <IconButton
          color="inherit"
          edge="start"
          aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={drawerOpen}
          onClick={onMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          File Converter
        </Typography>
        <Tooltip title={label}>
          <IconButton color="inherit" aria-label={label} onClick={() => setMode(isDark ? 'light' : 'dark')}>
            {isDark ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
