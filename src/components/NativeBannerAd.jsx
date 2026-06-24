import { useEffect } from 'react';

const NativeBannerAd = () => {
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'native-banner-container';
    
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.src = 'https://tuxedoarbourannouncement.com/e6437a40acd3b91a18136e0026a2b7cd/invoke.js';
    
    const div = document.createElement('div');
    div.id = 'container-e6437a40acd3b91a18136e0026a2b7cd';
    
    container.appendChild(script);
    container.appendChild(div);
    
    const target = document.getElementById('native-ad-wrapper');
    if (target) target.appendChild(container);
    
    return () => {
      if (target && container.parentNode === target) target.removeChild(container);
    };
  }, []);

  return <div id="native-ad-wrapper" />;
};

export default NativeBannerAd;