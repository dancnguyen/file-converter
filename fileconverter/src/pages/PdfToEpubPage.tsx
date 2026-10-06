import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TransformIcon from '@mui/icons-material/Transform';
import ImageIcon from '@mui/icons-material/Image';
import { convertPdfToEpub } from '../conversion/pdfToEpub';
import { createCoverFromPdf } from '../conversion/pdfCover';
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

type Cover = { file: File; previewUrl: string };

const COVER_TYPES = ['image/jpeg', 'image/png'];

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toEpubFileName(name: string) {
  const trimmed = name.trim();
  return /\.epub$/i.test(trimmed) ? trimmed : `${trimmed}.epub`;
}

export default function PdfToEpubPage() {
  const [file, setFile] = useState<File | null>(null);
  const [outputName, setOutputName] = useState('');
  const [converting, setConverting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [firstPageCover, setFirstPageCover] = useState<Cover | null>(null);
  const [customCover, setCustomCover] = useState<Cover | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverRequest = useRef(0);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    setFile(selected);
    setOutputName(selected.name.replace(/\.pdf$/i, '') + '.epub');
    setStatus(null);
    setCustomCover(null);
    renderFirstPageCover(selected);
  }

  async function renderFirstPageCover(pdf: File) {
    const request = ++coverRequest.current;
    setFirstPageCover(null);
    setCoverError(null);
    setCoverLoading(true);
    try {
      const coverFile = await createCoverFromPdf(pdf);
      const previewUrl = await readAsDataUrl(coverFile);
      if (request === coverRequest.current) setFirstPageCover({ file: coverFile, previewUrl });
    } catch {
      if (request === coverRequest.current) setCoverError('Could not render the first page as a cover.');
    } finally {
      if (request === coverRequest.current) setCoverLoading(false);
    }
  }

  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    if (!COVER_TYPES.includes(selected.type)) {
      setStatus({ severity: 'error', message: 'The cover image must be a JPEG or PNG.' });
      return;
    }
    setStatus(null);
    setCustomCover({ file: selected, previewUrl: await readAsDataUrl(selected) });
  }

  const cover = customCover ?? firstPageCover;

  function resetForm() {
    coverRequest.current++;
    setFile(null);
    setOutputName('');
    setFirstPageCover(null);
    setCustomCover(null);
    setCoverLoading(false);
    setCoverError(null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !outputName.trim()) return;

    setStatus(null);
    let target;
    try {
      target = await chooseSaveLocation(toEpubFileName(outputName), { description: 'EPUB e-book', mimeType: 'application/epub+zip', extension: '.epub' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatus({ severity: 'error', message: `Could not open the save dialog: ${detail}` });
      return;
    }
    if (!target) return;

    setConverting(true);
    try {
      await target.save(() => convertPdfToEpub(file, cover?.file));
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
            PDF to EPUB
          </Typography>
        </div>

        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={converting}>
            Choose PDF
            <VisuallyHiddenInput type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
          </Button>
          <Typography variant="body2" color={file ? 'text.primary' : 'text.secondary'} noWrap>
            {file ? file.name : 'No file selected'}
          </Typography>
        </Stack>

        {file && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 96,
                height: 128,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: 'action.hover',
              }}
            >
              {cover ? (
                <Box component="img" src={cover.previewUrl} alt="Cover preview" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : coverLoading ? (
                <CircularProgress size={24} aria-label="Rendering cover preview" />
              ) : (
                <ImageIcon color="disabled" />
              )}
            </Box>
            <Stack spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
              <Typography variant="subtitle2">Cover</Typography>
              <Typography variant="body2" color={coverError && !customCover ? 'error' : 'text.secondary'}>
                {customCover ? `Custom image: ${customCover.file.name}` : (coverError ?? 'First page of the PDF')}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Button component="label" variant="outlined" size="small" startIcon={<ImageIcon />} disabled={converting}>
                  Choose cover image
                  <VisuallyHiddenInput type="file" accept={COVER_TYPES.join(',')} onChange={handleCoverChange} />
                </Button>
                {customCover && (
                  <Button size="small" onClick={() => setCustomCover(null)} disabled={converting}>
                    Use first page instead
                  </Button>
                )}
              </Stack>
            </Stack>
          </Stack>
        )}

        <TextField
          label="Output File Name"
          value={outputName}
          onChange={(event) => setOutputName(event.target.value)}
          disabled={converting}
          required
          fullWidth
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
