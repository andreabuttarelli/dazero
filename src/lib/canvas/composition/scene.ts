import * as THREE from 'three';
import { CAMERA_PRESETS, cameraAt, type CameraPresetId } from './camera';
import { LAYOUTS } from './index';
import type { LayoutId, LayoutParams } from './types';

export type MediaKind = 'image' | 'video';

export type CompositionMedia = {
	url: string;
	kind: MediaKind;
	aspect: number;
};

export type CompositionSceneOptions = {
	media: CompositionMedia[];
	layout: LayoutId;
	layoutParams: LayoutParams;
	camera: CameraPresetId;
	cameraParams: LayoutParams;
	background: string;
	onTextureReady?: () => void;
};

export type CompositionScene = {
	renderAt(t: number): void;
	resize(width: number, height: number): void;
	dispose(): void;
};

export function createCompositionScene(canvas: HTMLCanvasElement, options: CompositionSceneOptions): CompositionScene {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(options.background);

	const camera = new THREE.PerspectiveCamera(CAMERA_PRESETS[options.camera].cameraAt(options.cameraParams, 0).fov, 1, 0.1, 500);

	const built = options.media.map((media) => createMesh(media, options.onTextureReady));
	const meshes = built.map(({ mesh }) => mesh);
	for (const mesh of meshes) {
		scene.add(mesh);
	}

	const videoElements = built.map(({ video }) => video).filter((video): video is HTMLVideoElement => video !== null);

	function renderAt(t: number): void {
		const transforms = LAYOUTS[options.layout].transforms(meshes.length, options.layoutParams, t);
		for (let i = 0; i < meshes.length; i++) {
			applyTransform(meshes[i], transforms[i]);
		}

		const cameraState = cameraAt(options.camera, options.cameraParams, t);
		camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
		camera.lookAt(cameraState.target.x, cameraState.target.y, cameraState.target.z);
		camera.fov = cameraState.fov;
		camera.updateProjectionMatrix();

		for (const video of videoElements) {
			if (video.readyState >= video.HAVE_CURRENT_DATA) {
				video.currentTime = t % (video.duration || 1);
			}
		}

		renderer.render(scene, camera);
	}

	function resize(width: number, height: number): void {
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}

	function dispose(): void {
		for (const mesh of meshes) {
			mesh.geometry.dispose();
			const material = mesh.material as THREE.MeshBasicMaterial;
			material.map?.dispose();
			material.dispose();
		}

		for (const video of videoElements) {
			video.pause();
			video.removeAttribute('src');
			video.load();
		}

		renderer.dispose();
	}

	return { renderAt, resize, dispose };
}

function createMesh(
	media: CompositionMedia,
	onTextureReady?: () => void
): { mesh: THREE.Mesh; video: HTMLVideoElement | null } {
	const geometry = new THREE.PlaneGeometry(media.aspect, 1);
	const material = new THREE.MeshBasicMaterial({ transparent: true });
	const mesh = new THREE.Mesh(geometry, material);

	if (media.kind === 'image') {
		const loader = new THREE.TextureLoader();
		loader.setCrossOrigin('anonymous');
		loader.load(media.url, (texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;
			material.map = texture;
			material.needsUpdate = true;
			onTextureReady?.();
		});
		return { mesh, video: null };
	}

	const video = createVideoElement(media.url);
	const texture = new THREE.VideoTexture(video);
	texture.colorSpace = THREE.SRGBColorSpace;
	material.map = texture;
	material.needsUpdate = true;
	video.addEventListener('loadeddata', () => onTextureReady?.(), { once: true });
	return { mesh, video };
}

function createVideoElement(url: string): HTMLVideoElement {
	const video = document.createElement('video');
	video.src = url;
	video.crossOrigin = 'anonymous';
	video.muted = true;
	video.loop = true;
	video.playsInline = true;
	video.play().catch(() => {});
	return video;
}

function applyTransform(mesh: THREE.Mesh, transform: ReturnType<(typeof LAYOUTS)[LayoutId]['transforms']>[number]): void {
	mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
	mesh.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
	mesh.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}
