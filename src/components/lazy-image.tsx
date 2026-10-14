import { AnimatePresence, motion, useInView } from 'framer-motion';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const LazyImage = (props: Props) => {
  const {
    src,
    alt,
    fallbackSrc,
    width,
    height,
    containerStyle,
    containerClassName,
    style,
    className,
    delay = 0,
    ...restProps
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);

  const isInView = useInView(containerRef, { once: true });

  const [isLoaded, setLoaded] = useState(false);
  const [isError, setError] = useState(false);

  const renderFallback = useMemo(() => {
    if (typeof fallbackSrc === 'string') {
      return <img src={fallbackSrc} alt={alt ?? ''} style={style} className="w-full h-full object-cover" />;
    }
    if (fallbackSrc) {
      return <>{fallbackSrc}</>;
    }
    return null;
  }, [fallbackSrc]);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [src]);

  return (
    <motion.div
      {...restProps}
      ref={containerRef}
      className={`relative ${containerClassName}`}
      style={{
        width,
        height,
        ...containerStyle
      }}
    >
      <AnimatePresence mode="wait">
        {isInView && (
          <motion.img
            key={src + "real-image"}
            src={src}
            alt={alt ?? ''}
            style={style}
            className={`real-image w-full h-full ${className}`}
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1 }
            }}
            animate={(isLoaded && !isError) ? 'visible' : 'hidden'}
            exit="hidden"
            initial="hidden"
            transition={{ duration: 0.3, ease: 'easeInOut', delay: delay }}
            onLoad={() => {
              setLoaded(true);
            }}
            onError={(e) => {
              // console.log('LazyImage caught the error: %o, src: %s', e, src);
              setError(true);
            }}
          />
        )}
        {(!isInView || !isLoaded || isError) && (
          <motion.div
            key={src + "fallback-image"}
            className="absolute z-[1] left-0 top-0 w-full h-full flex justify-center items-center"
            variants={{
              hidden: {
                opacity: 0,
                transition: {
                  duration: 0.3,
                  ease: 'easeInOut'
                }
              },
              visible: {
                opacity: 1,
                transition: {
                  duration: 0
                }
              }
            }}
            animate="visible"
            exit="hidden"
            initial="visible"
          >
            {renderFallback}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LazyImage;

export interface Props {
  src: string;
  fallbackSrc?: string | React.ReactNode;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  containerClassName?: string;
  style?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  delay?: number;

  [k: string]: any;
}
