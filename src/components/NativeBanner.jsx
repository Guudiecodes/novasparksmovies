import { useEffect } from 'react';

function NativeBanner() {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {}
  }, []);

  return (
    <div id="container-22e5c3e32301ad5e2fdcd392d705a30" />
  );
}

export default NativeBanner;