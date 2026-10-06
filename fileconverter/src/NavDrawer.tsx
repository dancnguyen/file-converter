import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import HomeIcon from '@mui/icons-material/Home';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import TabIcon from '@mui/icons-material/Tab';
import type { View } from './views';

const drawerWidth = 250;

const navItems: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'home', label: 'Home', icon: <HomeIcon /> },
  { view: 'pdf-to-epub', label: 'PDF to EPUB', icon: <MenuBookIcon /> },
  { view: 'png-to-favicon', label: 'PNG to Favicon', icon: <TabIcon /> },
];

type NavDrawerProps = {
  open: boolean;
  currentView: View;
  onNavigate: (view: View) => void;
};

export default function NavDrawer({ open, currentView, onNavigate }: NavDrawerProps) {
  return (
    <Drawer
      variant="persistent"
      open={open}
      sx={(theme) => ({
        width: open ? drawerWidth : 0,
        flexShrink: 0,
        transition: theme.transitions.create('width', {
          easing: open ? theme.transitions.easing.easeOut : theme.transitions.easing.sharp,
          duration: open ? theme.transitions.duration.enteringScreen : theme.transitions.duration.leavingScreen,
        }),
        '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
      })}
    >
      {}
      <Toolbar />
      <List component="nav">
        {navItems.map(({ view, label, icon }) => (
          <ListItem key={view} disablePadding>
            <ListItemButton selected={view === currentView} onClick={() => onNavigate(view)}>
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
}
