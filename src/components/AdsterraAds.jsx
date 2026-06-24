import { useEffect } from 'react';

const AdsterraAds = () => {
  useEffect(() => {
    const s1 = document.createElement('script');
    s1.src = 'https://tuxedoarbourannouncement.com/bd/b6/3a/bdb63a60b2b5c511d2c5c18794a57013.js';
    s1.async = true;
    s1.id = 'adsterra-1';

    const s2 = document.createElement('script');
    s2.src = '//p16441576.highrevenuegate.com/22e5c3e32301ad5e2fdcd392d705a30/invoke.js';
    s2.async = true;
    s2.setAttribute('data-cfasync', 'false');
    s2.id = 'adsterra-2';

    document.body.appendChild(s1);
    document.body.appendChild(s2);

    return () => {
      document.getElementById('adsterra-1')?.remove();
      document.getElementById('adsterra-2')?.remove();
    };
  }, []);

  return null;
};

export default AdsterraAds;