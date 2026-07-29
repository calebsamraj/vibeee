import React, { useEffect, useRef } from 'react';

export default function ThreeBackground() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!window.THREE) {
      console.warn("Three.js is not loaded.");
      return;
    }

    const THREE = window.THREE;
    const container = containerRef.current;
    if (!container) return;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    
    // Add dark space fog for depth
    scene.fog = new THREE.FogExp2(0x050811, 0.0018);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    camera.position.z = 100;
    camera.position.y = 15;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050811, 1);
    container.appendChild(renderer.domElement);

    // 2. Create Floating Particle Stars (Nebula effect)
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 1200;
    const positions = new Float32Array(starsCount * 3);
    const colors = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
      // Position spread
      positions[i] = (Math.random() - 0.5) * 400; // X
      positions[i + 1] = (Math.random() - 0.2) * 200; // Y (tilted slightly upwards)
      positions[i + 2] = (Math.random() - 0.5) * 400; // Z

      // Color: Cyan-to-blue gradients
      const mix = Math.random();
      colors[i] = mix * 0.1; // R (very low red)
      colors[i + 1] = 0.5 + mix * 0.4; // G (cyan-teal green)
      colors[i + 2] = 0.8 + mix * 0.2; // B (cyan-teal blue)
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Simple round particle texture using canvas
    const createParticleTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.3, 'rgba(34, 211, 238, 0.8)'); // cyan-400
      gradient.addColorStop(0.7, 'rgba(6, 182, 212, 0.2)'); // cyan-500
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 16);
      return new THREE.CanvasTexture(canvas);
    };

    const starsMaterial = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      map: createParticleTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);

    // 3. Create Perspective Grid Plane (Synthwave neon grid)
    const gridHelper = new THREE.GridHelper(300, 30, 0x06b6d4, 0x0f172a);
    gridHelper.position.y = -15;
    scene.add(gridHelper);

    // 4. Parallax Mouse Move Listener
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (event) => {
      mouseX = (event.clientX - window.innerWidth / 2) * 0.05;
      mouseY = (event.clientY - window.innerHeight / 2) * 0.05;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 5. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      const elapsedTime = clock.getElapsedTime();

      // Rotate particle field slowly
      starField.rotation.y = elapsedTime * 0.012;
      starField.rotation.x = elapsedTime * 0.004;

      // Animate grid to scroll forward (scrolling simulation)
      gridHelper.position.z = (elapsedTime * 15) % 10;

      // Smooth camera interpolation (lerp) based on mouse
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      camera.position.x = targetX;
      camera.position.y = 15 - targetY;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    };
    animate();

    // 6. Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      // dispose resources to prevent memory leaks
      starsGeometry.dispose();
      starsMaterial.dispose();
      gridHelper.geometry.dispose();
      gridHelper.material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{ background: '#050811' }}
    />
  );
}
