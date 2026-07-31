import React, { useEffect, useRef, useState } from 'react';

/**
 * AmbientBackground component provides a highly optimized, high-performance visual backdrop:
 * 1. A GPU-accelerated CSS-based organic Gemini AI morphing glow (shifting emerald green, cyan, violet, and lime).
 * 2. An ambient blurred backlight of the uploaded photo that dynamically adapts to the photo's colors.
 * 3. A 3D floating musical notes scene using Three.js, drifting and rotating in space with glowing neon materials.
 */
export default function AmbientBackground({ imagePreview }) {
  const containerRef = useRef(null);
  const [activeImage, setActiveImage] = useState(imagePreview);
  const [fadeState, setFadeState] = useState('in');

  // Sync image changes with cross-fade animation
  useEffect(() => {
    if (imagePreview !== activeImage) {
      setFadeState('out');
      const timer = setTimeout(() => {
        setActiveImage(imagePreview);
        setFadeState('in');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [imagePreview, activeImage]);

  // Three.js floating 3D musical notes animation
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
    
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      500
    );
    camera.position.z = 80;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap pixel ratio for performance
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // transparent background so CSS gradients show through
    container.appendChild(renderer.domElement);

    // 2. Setup Lighting (emissive glowing materials require light)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);

    // 3. Define Glowing Note Materials matching the Gemini palette
    const materials = [
      new THREE.MeshPhongMaterial({
        color: 0x10b981, // Emerald Green
        emissive: 0x059669,
        emissiveIntensity: 0.6,
        shininess: 60,
        transparent: true,
        opacity: 0.8
      }),
      new THREE.MeshPhongMaterial({
        color: 0x06b6d4, // Cyan
        emissive: 0x0891b2,
        emissiveIntensity: 0.6,
        shininess: 60,
        transparent: true,
        opacity: 0.8
      }),
      new THREE.MeshPhongMaterial({
        color: 0x8b5cf6, // Violet/Purple
        emissive: 0x6d28d9,
        emissiveIntensity: 0.5,
        shininess: 60,
        transparent: true,
        opacity: 0.8
      }),
      new THREE.MeshPhongMaterial({
        color: 0x84cc16, // Lime Green
        emissive: 0x65a30d,
        emissiveIntensity: 0.5,
        shininess: 60,
        transparent: true,
        opacity: 0.8
      })
    ];

    // 4. Geometry Creators for 3D Musical Notes
    const createSingleNote = (material) => {
      const group = new THREE.Group();
      
      // Note Head (Flattened cylinder)
      const headGeo = new THREE.CylinderGeometry(2, 2, 1, 12);
      const head = new THREE.Mesh(headGeo, material);
      head.rotation.x = Math.PI / 2;
      head.rotation.z = -Math.PI / 6;
      head.scale.set(1.3, 0.9, 1.0);
      group.add(head);

      // Stem (Thin cylinder)
      const stemGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 6);
      const stem = new THREE.Mesh(stemGeo, material);
      stem.position.set(1.6, 4, 0);
      group.add(stem);

      // Flag (Small rotated box)
      const flagGeo = new THREE.BoxGeometry(2.5, 0.8, 0.4);
      const flag = new THREE.Mesh(flagGeo, material);
      flag.position.set(2.4, 7.6, 0);
      flag.rotation.z = -Math.PI / 8;
      group.add(flag);

      return group;
    };

    const createDoubleNote = (material) => {
      const group = new THREE.Group();
      
      // Note Head 1
      const headGeo = new THREE.CylinderGeometry(2, 2, 1, 12);
      const head1 = new THREE.Mesh(headGeo, material);
      head1.rotation.x = Math.PI / 2;
      head1.rotation.z = -Math.PI / 6;
      head1.scale.set(1.3, 0.9, 1.0);
      head1.position.set(-3, 0, 0);
      group.add(head1);

      // Stem 1
      const stemGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 6);
      const stem1 = new THREE.Mesh(stemGeo, material);
      stem1.position.set(-1.4, 4, 0);
      group.add(stem1);

      // Note Head 2 (Clone & Offset)
      const head2 = head1.clone();
      head2.position.set(3, 0.8, 0);
      group.add(head2);

      // Stem 2
      const stem2 = stem1.clone();
      stem2.position.set(4.6, 4.4, 0);
      group.add(stem2);

      // Connecting Beam/Bar
      const beamGeo = new THREE.BoxGeometry(6.3, 0.8, 0.5);
      const beam = new THREE.Mesh(beamGeo, material);
      beam.position.set(1.6, 8.2, 0);
      beam.rotation.z = Math.atan2(0.8, 6); // angle matching stem height diff
      group.add(beam);

      return group;
    };

    // 5. Create Notes Pool
    const notes = [];
    const notesCount = 14; // kept low for excellent performance

    for (let i = 0; i < notesCount; i++) {
      const material = materials[Math.floor(Math.random() * materials.length)];
      const note = Math.random() > 0.5 ? createSingleNote(material) : createDoubleNote(material);
      
      // Randomize initial states
      note.position.x = (Math.random() - 0.5) * 120;
      note.position.y = (Math.random() - 0.5) * 80;
      note.position.z = (Math.random() - 0.5) * 40 - 10; // keep in mid-depth

      const scale = 0.5 + Math.random() * 0.7;
      note.scale.set(scale, scale, scale);

      // Store animation properties inside userData
      note.userData = {
        speedY: 0.05 + Math.random() * 0.08,
        floatFreq: 0.5 + Math.random() * 1.0,
        floatAmp: 0.02 + Math.random() * 0.03,
        floatOffset: Math.random() * Math.PI * 2,
        rotSpeedX: (Math.random() - 0.5) * 0.015,
        rotSpeedY: (Math.random() - 0.5) * 0.015,
        rotSpeedZ: (Math.random() - 0.5) * 0.01
      };

      scene.add(note);
      notes.push(note);
    }

    // 6. Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      const elapsedTime = clock.getElapsedTime();

      // Animate floating notes
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        
        // Rise slowly
        note.position.y += note.userData.speedY;

        // Float left/right
        note.position.x += Math.sin(elapsedTime * note.userData.floatFreq + note.userData.floatOffset) * note.userData.floatAmp;

        // Slow 3D rotation
        note.rotation.x += note.userData.rotSpeedX;
        note.rotation.y += note.userData.rotSpeedY;
        note.rotation.z += note.userData.rotSpeedZ;

        // Reset if drifted too far top
        if (note.position.y > 55) {
          note.position.y = -55;
          note.position.x = (Math.random() - 0.5) * 120;
          note.position.z = (Math.random() - 0.5) * 40 - 10;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 7. Window Resize Listener
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup resources
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      
      // Dispose geometry and materials
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      materials.forEach(mat => mat.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <>
      {/* CSS-based keyframe animations for the Gemini Glow */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes gemini-glow-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(12%, 15%) scale(1.15); }
          66% { transform: translate(-8%, -12%) scale(0.92); }
        }
        @keyframes gemini-glow-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-15%, -8%) scale(0.85); }
          66% { transform: translate(10%, 15%) scale(1.2); }
        }
        @keyframes gemini-glow-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1.1); }
          50% { transform: translate(-12%, 8%) scale(0.95); }
        }
        @keyframes gemini-glow-4 {
          0%, 100% { transform: translate(0px, 0px) scale(0.9); }
          50% { transform: translate(15%, -15%) scale(1.15); }
        }
        .animate-gemini-glow-1 {
          animation: gemini-glow-1 16s ease-in-out infinite;
        }
        .animate-gemini-glow-2 {
          animation: gemini-glow-2 20s ease-in-out infinite;
        }
        .animate-gemini-glow-3 {
          animation: gemini-glow-3 18s ease-in-out infinite;
        }
        .animate-gemini-glow-4 {
          animation: gemini-glow-4 22s ease-in-out infinite;
        }
      `}} />

      <div className="fixed inset-0 -z-10 bg-[#02050f] overflow-hidden pointer-events-none select-none">
        
        {/* Gemini AI Organic Morphing Glow (Vibrant gradients, green-focused) */}
        <div className="absolute inset-0 overflow-hidden opacity-90 pointer-events-none select-none">
          {/* Glow 1: Emerald/Mint Green */}
          <div className="absolute w-[60vw] h-[60vw] rounded-full bg-emerald-500/12 blur-[120px] animate-gemini-glow-1 top-[-10%] left-[-15%]" />
          
          {/* Glow 2: Cyan/Neon Blue */}
          <div className="absolute w-[55vw] h-[55vw] rounded-full bg-cyan-500/12 blur-[120px] animate-gemini-glow-2 top-[15%] right-[-10%]" />
          
          {/* Glow 3: Violet/Royal Purple */}
          <div className="absolute w-[65vw] h-[65vw] rounded-full bg-violet-600/8 blur-[130px] animate-gemini-glow-3 bottom-[-15%] left-[10%]" />
          
          {/* Glow 4: Lime/Yellow-Green (adds the signature Gemini electric glow) */}
          <div className="absolute w-[45vw] h-[45vw] rounded-full bg-lime-400/8 blur-[110px] animate-gemini-glow-4 top-[-15%] right-[20%]" />
        </div>

        {/* Subtle grid backdrop */}
        <div 
          className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: '56px 56px',
          }}
        />

        {/* Ambient image glow layer (faded behind) */}
        {activeImage && (
          <div 
            className={`absolute top-[-15%] left-1/2 -translate-x-1/2 w-[130vw] h-[65vh] md:w-[80vw] md:h-[70vh] rounded-[100%] blur-[120px] saturate-[1.6] transition-all duration-700 ease-out pointer-events-none scale-105 ${
              fadeState === 'in' ? 'scale-100 opacity-[0.22]' : 'scale-95 opacity-0'
            }`}
            style={{
              backgroundImage: `url(${activeImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}

        {/* 3D WebGL Canvas Layer for floating notes */}
        <div 
          ref={containerRef} 
          className="absolute inset-0 w-full h-full pointer-events-none" 
        />

        {/* Vignette layer for rich cinematic contrast */}
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{ background: 'radial-gradient(circle at center, transparent 35%, #02050f 98%)' }}
        />
      </div>
    </>
  );
}
