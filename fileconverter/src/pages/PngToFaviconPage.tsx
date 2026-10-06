import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TransformIcon from '@mui/icons-material/Transform';
import { convertPngToFavicon } from '../conversion/pngToFavicon';
import { chooseSaveLocation } from '../saveFile';

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

type Status = { severity: 'success' | 'error'; message: string } | null;

function toIcoFileName(name: string) {
  const trimmed = name.trim();
  return /\.ico$/i.test(trimmed) ? trimmed : `${trimmed}.ico`;
}

export default function PngToFaviconPage() {
  const [file, setFile] = useState<File | null>(null);
  const [outputName, setOutputName] = useState('');
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [converting, setConverting] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    if (selected.type !== 'image/png') {
      setStatus({ severity: 'error', message: 'The image must be a PNG.' });
      return;
    }
    setFile(selected);
    setOutputName(selected.name.replace(/\.png$/i, '') + '.ico');
    setStatus(null);
  }

  function resetForm() {
    setFile(null);
    setOutputName('');
    setTransparentBackground(false);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !outputName.trim()) return;

    setStatus(null);
    let target;
    try {
      target = await chooseSaveLocation(toIcoFileName(outputName), { description: 'Favicon', mimeType: 'image/x-icon', extension: '.ico' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatus({ severity: 'error', message: `Could not open the save dialog: ${detail}` });
      return;
    }
    if (!target) return;

    setConverting(true);
    try {
      await target.save(() => convertPngToFavicon(file, transparentBackground));
      resetForm();
      setStatus({ severity: 'success', message: `Converted and saved ${target.name}.` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatus({ severity: 'error', message: `Conversion failed: ${detail}` });
    } finally {
      setConverting(false);
    }
  }

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ maxWidth: 560, mx: 'auto', mt: 4, p: 3 }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h5" component="h1" gutterBottom>
            PNG to Favicon
          </Typography>
        </div>

        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={converting}>
            Choose PNG
            <VisuallyHiddenInput type="file" accept="image/png,.png" onChange={handleFileChange} />
          </Button>
          <Typography variant="body2" color={file ? 'text.primary' : 'text.secondary'} noWrap>
            {file ? file.name : 'No file selected'}
          </Typography>
        </Stack>

        <TextField
          label="Output File Name"
          value={outputName}
          onChange={(event) => setOutputName(event.target.value)}
          disabled={converting}
          required
          fullWidth
        />

        <FormControlLabel
          control={
            <Checkbox checked={transparentBackground} onChange={(event) => setTransparentBackground(event.target.checked)} disabled={converting} />
          }
          label="Translucent background"
        />

        <Button
          type="submit"
          variant="contained"
          startIcon={<TransformIcon />}
          loading={converting}
          loadingPosition="start"
          disabled={!file || !outputName.trim()}
        >
          Convert
        </Button>

        {status && <Alert severity={status.severity}>{status.message}</Alert>}
      </Stack>
    </Paper>
  );
}
