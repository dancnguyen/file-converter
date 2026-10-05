import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function HomePage() {
  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 8, px: 2, textAlign: 'center' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Welcome
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Open the menu in the top left and select a file conversion tool.
      </Typography>
    </Box>
  );
}
