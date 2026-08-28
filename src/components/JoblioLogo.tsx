import { useTheme } from '../context/ThemeContext';
import joblioLogo from '../assets/joblio-logo.png';
import joblioLogoWhite from '../assets/joblio-logo-white.png';

interface JoblioLogoProps {
  className?: string;
  alt?: string;
}

export default function JoblioLogo({ className = 'mx-auto h-28 w-auto max-w-[320px] object-contain', alt = 'Joblio' }: JoblioLogoProps) {
  const { theme } = useTheme();
  return (
    <img
      src={theme === 'dark' ? joblioLogoWhite : joblioLogo}
      alt={alt}
      className={className}
    />
  );
}
