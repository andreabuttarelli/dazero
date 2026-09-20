import { describe, expect, it } from 'vitest';
import {
	RASTER_IMAGE_ACCEPT,
	RASTER_OR_VIDEO_ACCEPT,
	isHeicSource,
	isRasterImageSource,
	isRasterOrVideoFile,
	isUploadableMediaFile,
	isVectorImageSource,
	jpegFilename,
	sniffRasterKind
} from './raster-image';

describe('raster picker helpers', () => {
	it('lists HEIC in every image picker accept string', () => {
		expect(RASTER_IMAGE_ACCEPT).toContain('image/heic');
		expect(RASTER_IMAGE_ACCEPT).toContain('.heic');
		expect(RASTER_OR_VIDEO_ACCEPT).toContain('image/heic');
		expect(RASTER_OR_VIDEO_ACCEPT).toContain('video/*');
	});

	it('treats iPhone HEIC filenames as rasters even with an empty mime', () => {
		expect(isRasterImageSource({ mime: '', filename: 'IMG_0002.HEIC' })).toBe(true);
		expect(isHeicSource({ mime: '', filename: 'photo.heif' })).toBe(true);
		expect(sniffRasterKind(new Uint8Array(), 'image/heic', '')).toBe('heic');
		expect(isRasterImageSource({ mime: 'image/png', filename: 'logo.png' })).toBe(true);
		expect(isRasterImageSource({ mime: 'application/pdf', filename: 'x.pdf' })).toBe(false);
	});

	it('accepts video files alongside rasters', () => {
		expect(isRasterOrVideoFile({ type: 'video/mp4', name: 'clip.mp4' })).toBe(true);
		expect(isRasterOrVideoFile({ type: '', name: 'IMG_1.heic' })).toBe(true);
		expect(isRasterOrVideoFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
	});

	it('rewrites HEIC names to .jpg', () => {
		expect(jpegFilename('IMG_0002.HEIC')).toBe('IMG_0002.jpg');
		expect(jpegFilename('logo.png')).toBe('logo.jpg');
	});
});

/**
 * IL DIFETTO PAGATO, 2026-09-20. Un SVG scelto nel picker dei media spariva senza un messaggio:
 * `isRasterOrVideoFile` lo dava per falso e il ciclo di upload faceva `continue`. Nessun errore,
 * nessuna riga, nessun file — e in pagina restava il segnaposto, che sembrava un guasto del
 * rendering mentre il file non era mai partito.
 *
 * Un SVG NON è un raster, e questi helper non devono dire che lo sia: `sniffRasterKind` continua
 * a chiamarlo `unknown`, perché nessuna conversione JPEG lo tocca. Quello che cambia è chi decide
 * se un file si può caricare.
 */
describe('SVG — vettoriale, non raster, ma caricabile', () => {
	it('non finisce fra i raster: nessuna conversione lo tocca', () => {
		expect(sniffRasterKind(new Uint8Array(), 'image/svg+xml', 'logo.svg')).toBe('unknown');
		expect(isRasterImageSource({ mime: 'image/svg+xml', filename: 'logo.svg' })).toBe(false);
	});

	it('è riconosciuto come vettoriale, dal mime o dal nome', () => {
		expect(isVectorImageSource({ mime: 'image/svg+xml', filename: 'logo.svg' })).toBe(true);
		expect(isVectorImageSource({ mime: '', filename: 'Logo.SVG' })).toBe(true);
		expect(isVectorImageSource({ mime: 'image/png', filename: 'logo.png' })).toBe(false);
		expect(isVectorImageSource({ mime: 'application/pdf', filename: 'x.pdf' })).toBe(false);
	});

	it('passa il cancello dell\'upload invece di essere scartato in silenzio', () => {
		expect(isUploadableMediaFile({ type: 'image/svg+xml', name: 'logo.svg' })).toBe(true);
		expect(isUploadableMediaFile({ type: '', name: 'mark.svg' })).toBe(true);
		expect(isUploadableMediaFile({ type: 'image/png', name: 'a.png' })).toBe(true);
		expect(isUploadableMediaFile({ type: 'video/mp4', name: 'c.mp4' })).toBe(true);
		expect(isUploadableMediaFile({ type: 'application/pdf', name: 'x.pdf' })).toBe(false);
	});

	it('il picker lo offre, o il file non è nemmeno selezionabile', () => {
		expect(RASTER_OR_VIDEO_ACCEPT).toContain('.svg');
		expect(RASTER_OR_VIDEO_ACCEPT).toContain('image/svg+xml');
	});
});
