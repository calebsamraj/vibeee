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
    
    // Add deep dark space fog for height fading
    scene.fog = new THREE.FogExp2(0x050811, 0.0018);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    camera.position.z = 120;
    camera.position.y = 20;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050811, 1);
    container.appendChild(renderer.domElement);

    // 2. Create Floating Particle Stars (Vibrant Gradient Nebula effect)
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 1200;
    const positions = new Float32Array(starsCount * 3);
    const colors = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
      // Position spread
      positions[i] = (Math.random() - 0.5) * 500; // X
      positions[i + 1] = (Math.random() - 0.2) * 250; // Y (offset slightly upwards)
      positions[i + 2] = (Math.random() - 0.5) * 500; // Z

      // Color: Neon gradients (Magenta, Pink, Violet, Blue, Cyan)
      const color = new THREE.Color();
      const hue = Math.random() < 0.45 
        ? 0.76 + Math.random() * 0.16 // Pink/magenta/violet (0.76 - 0.92 HSL)
        : 0.48 + Math.random() * 0.16; // Cyan/teal/blue (0.48 - 0.64 HSL)
      color.setHSL(hue, 0.95, 0.6);
      
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Custom multi-colored glowing particle texture using HTML Canvas
    const createParticleTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(244, 63, 94, 0.8)');   // rose-500 (hot pink)
      gradient.addColorStop(0.6, 'rgba(6, 182, 212, 0.35)');  // cyan-500
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 16);
      return new THREE.CanvasTexture(canvas);
    };

    const starsMaterial = new THREE.PointsMaterial({
      size: 2.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      map: createParticleTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);

    // 3. Create 3D Music Visualizer Wave Plane (Dynamic Neon Gradient Grid)
    const planeWidth = 500;
    const planeHeight = 500;
    const segmentsX = 45;
    const segmentsY = 45;
    const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight, segmentsX, segmentsY);

    // Set vertex colors based on coordinates to make a gradient
    const gridColors = [];
    const vertexCount = planeGeo.attributes.position.count;
    for (let i = 0; i < vertexCount; i++) {
      const x = planeGeo.attributes.position.getX(i);
      const y = planeGeo.attributes.position.getY(i);
      
      // Calculate distance ratio from the center
      const dist = Math.sqrt(x*x + y*y);
      const ratio = Math.min(dist / 350, 1.0); // 0 to 1
      
      const color = new THREE.Color();
      // Center is neon cyan (0.5 hue), outer edges are hot magenta (0.9 hue)
      color.setHSL(0.5 + ratio * 0.38, 0.95, 0.55);
      gridColors.push(color.r, color.g, color.b);
    }
    planeGeo.setAttribute('color', new THREE.Float32BufferAttribute(gridColors, 3));

    const planeMat = new THREE.MeshBasicMaterial({
      wireframe: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const waveGrid = new THREE.Mesh(planeGeo, planeMat);
    waveGrid.rotation.x = -Math.PI / 2; // Lie flat on the floor
    waveGrid.position.y = -35; // Position below UI elements
    scene.add(waveGrid);

    // Keep initial positions for wave computations
    const initialPositions = planeGeo.attributes.position.clone();

    // 4. Parallax Mouse Move Listener
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (event) => {
      mouseX = (event.clientX - window.innerWidth / 2) * 0.06;
      mouseY = (event.clientY - window.innerHeight / 2) * 0.04;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 5. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      const elapsedTime = clock.getElapsedTime();
      const time = elapsedTime * 1.3;

      // Rotate particle field slowly
      starField.rotation.y = elapsedTime * 0.009;
      starField.rotation.x = elapsedTime * 0.003;

      // Animate grid geometry (deform Y coordinates as 3D music waves)
      const positions = planeGeo.attributes.position.array;
      const initial = initialPositions.array;

      for (let i = 0; i < positions.length; i += 3) {
        const x = initial[i];
        const y = initial[i + 1];

        // Double sine-wave displacement to simulate audio frequencies
        const z = Math.sin(x * 0.02 + time) * Math.cos(y * 0.02 + time) * 16 +
                  Math.sin(x * 0.055 - time * 1.4) * 4.5;
        
        positions[i + 2] = z; // Plane geometry lies flat, so Z is height
      }
      
      planeGeo.attributes.position.needsUpdate = true;
      planeGeo.computeVertexNormals();

      // Smooth camera interpolation (lerp) based on mouse
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      camera.position.x = targetX;
      camera.position.y = 20 - targetY;
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
      planeGeo.dispose();
      planeMat.dispose();
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
