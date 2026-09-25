import * as THREE from 'three';
import { CAMERA_PRESETS, cameraAt, type CameraPresetId } from './camera';
import { instanceCountFor, LAYOUTS } from './index';
import { closedExpoPhase, closedExpoProgress } from './motion';
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
	duration: number;
	onTextureReady?: () => void;
};

export type CompositionScene = {
	renderAt(t: number): void;
	resize(width: number, height: number): void;
	update(options: CompositionSceneUpdate): void;
	dispose(): void;
};

export type CompositionSceneUpdate = Pick<
	CompositionSceneOptions,
	'layout' | 'layoutParams' | 'camera' | 'cameraParams' | 'background' | 'duration'
>;

export function createCompositionScene(canvas: HTMLCanvasElement, options: CompositionSceneOptions): CompositionScene {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const scene = new THREE.Scene();
	let current = options;
	setCanvasBackground(canvas, current.background);

	const camera = new THREE.PerspectiveCamera(CAMERA_PRESETS[current.camera].cameraAt(current.cameraParams, 0).fov, 1, 0.1, 500);

	const built: BuiltMedia[] = [];
	syncInstances();

	function renderAt(t: number): void {
		const meshes = built.map(({ mesh }) => mesh);
		const layout = LAYOUTS[current.layout];
		const motionTime = layout.motion === 'cycle'
			? closedExpoPhase(t, current.duration)
			: closedExpoProgress(t, current.duration);
		const transforms = LAYOUTS[current.layout].transforms(meshes.length, current.layoutParams, motionTime);
		for (let i = 0; i < meshes.length; i++) {
			applyTransform(meshes[i], transforms[i]);
		}

		const cameraTime = layout.camera === 'fixed' ? 0 : motionTime;
		const cameraState = cameraAt(current.camera, current.cameraParams, cameraTime);
		camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
		camera.lookAt(cameraState.target.x, cameraState.target.y, cameraState.target.z);
		camera.fov = cameraState.fov;
		camera.updateProjectionMatrix();

		for (const { video } of built) {
			if (!video) {
				continue;
			}

			if (video.readyState >= video.HAVE_CURRENT_DATA) {
				video.currentTime = t % (video.duration || 1);
			}
		}

		renderer.render(scene, camera);
	}

	function resize(width: number, height: number): void {
		if (width <= 0 || height <= 0) {
			return;
		}

		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}

	function update(next: CompositionSceneUpdate): void {
		current = { ...current, ...next };
		syncInstances();
		setCanvasBackground(canvas, current.background);
	}

	function dispose(): void {
		for (const item of built) {
			disposeMedia(item);
		}

		renderer.dispose();
	}

	function syncInstances(): void {
		const desired = instanceCountFor(current.layout, current.media.length, current.layoutParams);

		while (built.length > desired) {
			const item = built.pop();
			if (item) {
				scene.remove(item.mesh);
				disposeMedia(item);
			}
		}

		while (built.length < desired) {
			const media = current.media[built.length % current.media.length];
			if (!media) {
				break;
			}

			const item = createMesh(media, current.onTextureReady);
			built.push(item);
			scene.add(item.mesh);
		}
	}

	return { renderAt, resize, update, dispose };
}

type BuiltMedia = { mesh: THREE.Mesh; video: HTMLVideoElement | null };

function createMesh(
	media: CompositionMedia,
	onTextureReady?: () => void
): BuiltMedia {
	const geometry = new THREE.PlaneGeometry(media.aspect, 1);
	const material = createMediaMaterial();
	const mesh = new THREE.Mesh(geometry, material);

	if (media.kind === 'image') {
		const loader = new THREE.TextureLoader();
		loader.setCrossOrigin('anonymous');
		loader.load(media.url, (texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;
			material.uniforms.mediaTexture.value = texture;
			material.uniforms.hasTexture.value = 1;
			onTextureReady?.();
		});
		return { mesh, video: null };
	}

	const video = createVideoElement(media.url);
	const texture = new THREE.VideoTexture(video);
	texture.colorSpace = THREE.SRGBColorSpace;
	material.uniforms.mediaTexture.value = texture;
	material.uniforms.hasTexture.value = 1;
	video.addEventListener('loadeddata', () => onTextureReady?.(), { once: true });
	return { mesh, video };
}

function disposeMedia({ mesh, video }: BuiltMedia): void {
	mesh.geometry.dispose();
	const material = mesh.material as THREE.ShaderMaterial;
	const texture = material.uniforms.mediaTexture.value as THREE.Texture | null;
	texture?.dispose();
	material.dispose();

	if (video) {
		video.pause();
		video.removeAttribute('src');
		video.load();
	}
}

function createMediaMaterial(): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		transparent: true,
		side: THREE.DoubleSide,
		depthWrite: true,
		uniforms: {
			mediaTexture: { value: null },
			hasTexture: { value: 0 },
			radius: { value: 0.075 },
			opacity: { value: 1 }
		},
		vertexShader: `
			varying vec2 mediaUv;
			void main() {
				mediaUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform sampler2D mediaTexture;
			uniform float hasTexture;
			uniform float radius;
			uniform float opacity;
			varying vec2 mediaUv;
			void main() {
				vec2 edge = abs(mediaUv - 0.5) - (0.5 - radius);
				float distanceToEdge = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - radius;
				float mask = 1.0 - smoothstep(-0.008, 0.008, distanceToEdge);
				vec4 media = hasTexture > 0.5 ? texture2D(mediaTexture, mediaUv) : vec4(0.12, 0.12, 0.14, 1.0);
				if (media.a * mask * opacity < 0.02) discard;
				gl_FragColor = vec4(media.rgb, media.a * mask * opacity);
			}
		`
	});
}

function setCanvasBackground(canvas: HTMLCanvasElement, background: string): void {
	canvas.style.background = background;
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
	(mesh.material as THREE.ShaderMaterial).uniforms.opacity.value = transform.opacity ?? 1;
}
