'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

const MAX_AVATAR_BYTES =
  5 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 12000;
const MAX_IMAGE_PIXELS =
  40 * 1000 * 1000;

const CROP_PREVIEW_SIZE = 280;
const OUTPUT_IMAGE_SIZE = 512;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;

const ALLOWED_IMAGE_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

async function readJsonResponse(
  response
) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function loadImage(url) {
  return new Promise(
    (resolve, reject) => {
      const image = new Image();

      image.decoding = 'async';

      image.onload = () => {
        resolve(image);
      };

      image.onerror = () => {
        reject(
          new Error(
            'The selected image could not be opened.'
          )
        );
      };

      image.src = url;
    }
  );
}

function canvasToBlob(
  canvas,
  type,
  quality
) {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(
            new Error(
              'The cropped profile picture could not be created.'
            )
          );
        },
        type,
        quality
      );
    }
  );
}

export default function ProfileAvatarUploader({
  profileId,
  displayName,
  initialAvatarSrc,
}) {
  const router = useRouter();

  const fileInputRef =
    useRef(null);

  const sourceImageRef =
    useRef(null);

  const dragStateRef =
    useRef(null);

  const [
    avatarSrc,
    setAvatarSrc,
  ] = useState(
    initialAvatarSrc || ''
  );

  const [
    selectedImageUrl,
    setSelectedImageUrl,
  ] = useState('');

  const [
    imageDimensions,
    setImageDimensions,
  ] = useState({
    width: 0,
    height: 0,
  });

  const [
    zoom,
    setZoom,
  ] = useState(1);

  const [
    offset,
    setOffset,
  ] = useState({
    x: 0,
    y: 0,
  });

  const [
    isEditorOpen,
    setIsEditorOpen,
  ] = useState(false);

  const [
    isUploading,
    setIsUploading,
  ] = useState(false);

  const [
    isLoadingImage,
    setIsLoadingImage,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  useEffect(() => {
    return () => {
      if (selectedImageUrl) {
        URL.revokeObjectURL(
          selectedImageUrl
        );
      }
    };
  }, [selectedImageUrl]);

  useEffect(() => {
    if (!isEditorOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    function handleKeyDown(event) {
      if (
        event.key === 'Escape' &&
        !isUploading
      ) {
        closeEditor();
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    isEditorOpen,
    isUploading,
  ]);

  function getImagePlacement(
    zoomValue = zoom
  ) {
    const {
      width,
      height,
    } = imageDimensions;

    if (
      width <= 0 ||
      height <= 0
    ) {
      return {
        scale: 1,
        width: CROP_PREVIEW_SIZE,
        height: CROP_PREVIEW_SIZE,
        maximumOffsetX: 0,
        maximumOffsetY: 0,
      };
    }

    const baseScale = Math.max(
      CROP_PREVIEW_SIZE / width,
      CROP_PREVIEW_SIZE / height
    );

    const scale =
      baseScale * zoomValue;

    const displayedWidth =
      width * scale;

    const displayedHeight =
      height * scale;

    return {
      scale,
      width: displayedWidth,
      height: displayedHeight,
      maximumOffsetX: Math.max(
        0,
        (
          displayedWidth -
          CROP_PREVIEW_SIZE
        ) / 2
      ),
      maximumOffsetY: Math.max(
        0,
        (
          displayedHeight -
          CROP_PREVIEW_SIZE
        ) / 2
      ),
    };
  }

  function clampOffset(
    nextOffset,
    zoomValue = zoom
  ) {
    const placement =
      getImagePlacement(
        zoomValue
      );

    return {
      x: clamp(
        nextOffset.x,
        -placement.maximumOffsetX,
        placement.maximumOffsetX
      ),
      y: clamp(
        nextOffset.y,
        -placement.maximumOffsetY,
        placement.maximumOffsetY
      ),
    };
  }

  function openFilePicker() {
    if (
      !isUploading &&
      !isLoadingImage
    ) {
      fileInputRef.current?.click();
    }
  }

  function closeEditor() {
    if (isUploading) {
      return;
    }

    setIsEditorOpen(false);
    setSelectedImageUrl('');
    setImageDimensions({
      width: 0,
      height: 0,
    });
    setZoom(1);
    setOffset({
      x: 0,
      y: 0,
    });

    sourceImageRef.current = null;
    dragStateRef.current = null;
  }

  async function handleFileChange(
    event
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = '';

    if (!file) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    if (
      !ALLOWED_IMAGE_TYPES.has(
        file.type
      )
    ) {
      setErrorMessage(
        'Choose a JPG, PNG, or WebP image.'
      );

      return;
    }

    if (
      !Number.isSafeInteger(
        file.size
      ) ||
      file.size <= 0
    ) {
      setErrorMessage(
        'The selected image is empty or invalid.'
      );

      return;
    }

    if (
      file.size >
      MAX_AVATAR_BYTES
    ) {
      setErrorMessage(
        'The profile picture cannot exceed 5 MB.'
      );

      return;
    }

    setIsLoadingImage(true);

    const objectUrl =
      URL.createObjectURL(file);

    try {
      const image =
        await loadImage(
          objectUrl
        );

      if (
        image.naturalWidth <= 0 ||
        image.naturalHeight <= 0
      ) {
        throw new Error(
          'The selected image has invalid dimensions.'
        );
      }

      if (
        image.naturalWidth >
          MAX_IMAGE_DIMENSION ||
        image.naturalHeight >
          MAX_IMAGE_DIMENSION ||
        (
          image.naturalWidth *
          image.naturalHeight
        ) > MAX_IMAGE_PIXELS
      ) {
        throw new Error(
          'The selected image is too large. Choose a smaller image.'
        );
      }

      if (selectedImageUrl) {
        URL.revokeObjectURL(
          selectedImageUrl
        );
      }

      sourceImageRef.current =
        image;

      setSelectedImageUrl(
        objectUrl
      );

      setImageDimensions({
        width:
          image.naturalWidth,
        height:
          image.naturalHeight,
      });

      setZoom(1);

      setOffset({
        x: 0,
        y: 0,
      });

      setIsEditorOpen(true);
    } catch (error) {
      URL.revokeObjectURL(
        objectUrl
      );

      console.error(
        'Profile image loading error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The selected image could not be opened.'
      );
    } finally {
      setIsLoadingImage(false);
    }
  }

  function handleZoomChange(
    event
  ) {
    const nextZoom =
      Number(
        event.target.value
      );

    if (
      !Number.isFinite(
        nextZoom
      )
    ) {
      return;
    }

    const normalizedZoom =
      clamp(
        nextZoom,
        MIN_ZOOM,
        MAX_ZOOM
      );

    setZoom(
      normalizedZoom
    );

    setOffset(
      (currentOffset) =>
        clampOffset(
          currentOffset,
          normalizedZoom
        )
    );
  }

  function handlePointerDown(
    event
  ) {
    if (
      isUploading ||
      !sourceImageRef.current
    ) {
      return;
    }

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );

    dragStateRef.current = {
      pointerId:
        event.pointerId,
      startX:
        event.clientX,
      startY:
        event.clientY,
      startingOffsetX:
        offset.x,
      startingOffsetY:
        offset.y,
    };
  }

  function handlePointerMove(
    event
  ) {
    const dragState =
      dragStateRef.current;

    if (
      !dragState ||
      dragState.pointerId !==
        event.pointerId
    ) {
      return;
    }

    const nextOffset = {
      x:
        dragState.startingOffsetX +
        (
          event.clientX -
          dragState.startX
        ),
      y:
        dragState.startingOffsetY +
        (
          event.clientY -
          dragState.startY
        ),
    };

    setOffset(
      clampOffset(
        nextOffset
      )
    );
  }

  function handlePointerEnd(
    event
  ) {
    const dragState =
      dragStateRef.current;

    if (
      !dragState ||
      dragState.pointerId !==
        event.pointerId
    ) {
      return;
    }

    try {
      event.currentTarget
        .releasePointerCapture(
          event.pointerId
        );
    } catch {
      /*
        The pointer may already have
        been released by the browser.
      */
    }

    dragStateRef.current = null;
  }

  async function createCroppedFile() {
    const image =
      sourceImageRef.current;

    if (!image) {
      throw new Error(
        'Choose an image before saving.'
      );
    }

    const placement =
      getImagePlacement();

    const displayedLeft =
      (
        CROP_PREVIEW_SIZE -
        placement.width
      ) / 2 + offset.x;

    const displayedTop =
      (
        CROP_PREVIEW_SIZE -
        placement.height
      ) / 2 + offset.y;

    const sourceX =
      -displayedLeft /
      placement.scale;

    const sourceY =
      -displayedTop /
      placement.scale;

    const sourceSize =
      CROP_PREVIEW_SIZE /
      placement.scale;

    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width =
      OUTPUT_IMAGE_SIZE;

    canvas.height =
      OUTPUT_IMAGE_SIZE;

    const context =
      canvas.getContext('2d');

    if (!context) {
      throw new Error(
        'The image editor could not be started.'
      );
    }

    context.imageSmoothingEnabled =
      true;

    context.imageSmoothingQuality =
      'high';

    context.fillStyle =
      '#ffffff';

    context.fillRect(
      0,
      0,
      OUTPUT_IMAGE_SIZE,
      OUTPUT_IMAGE_SIZE
    );

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_IMAGE_SIZE,
      OUTPUT_IMAGE_SIZE
    );

    const blob =
      await canvasToBlob(
        canvas,
        'image/jpeg',
        0.92
      );

    if (
      blob.size <= 0 ||
      blob.size >
        MAX_AVATAR_BYTES
    ) {
      throw new Error(
        'The cropped profile picture has an invalid size.'
      );
    }

    return new File(
      [blob],
      'profile-picture.jpg',
      {
        type: 'image/jpeg',
        lastModified:
          Date.now(),
      }
    );
  }

  async function uploadCroppedFile(
    file
  ) {
    const authorizationResponse =
      await fetch(
        '/api/profile/avatar/upload',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            filename:
              file.name,
            contentType:
              file.type,
            fileSize:
              file.size,
          }),
        }
      );

    const authorizationBody =
      await readJsonResponse(
        authorizationResponse
      );

    if (
      !authorizationResponse.ok ||
      !authorizationBody?.success ||
      !authorizationBody.uploadUrl ||
      !authorizationBody.fileKey ||
      !authorizationBody.uploadHeaders
    ) {
      throw new Error(
        authorizationBody?.error ||
          'The profile-picture upload could not be started.'
      );
    }

    const uploadResponse =
      await fetch(
        authorizationBody.uploadUrl,
        {
          method: 'PUT',
          headers:
            authorizationBody
              .uploadHeaders,
          body: file,
        }
      );

    if (!uploadResponse.ok) {
      throw new Error(
        'The image could not be uploaded to storage.'
      );
    }

    const completionResponse =
      await fetch(
        '/api/profile/avatar/complete',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            fileKey:
              authorizationBody.fileKey,
          }),
        }
      );

    const completionBody =
      await readJsonResponse(
        completionResponse
      );

    if (
      !completionResponse.ok ||
      !completionBody?.success ||
      !completionBody.avatarPath
    ) {
      throw new Error(
        completionBody?.error ||
          'The profile picture could not be saved.'
      );
    }

    return completionBody.avatarPath;
  }

  async function handleSaveCrop() {
    if (isUploading) {
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const croppedFile =
        await createCroppedFile();

      const avatarPath =
        await uploadCroppedFile(
          croppedFile
        );

      setAvatarSrc(
        avatarPath
      );

      setSuccessMessage(
        'Profile picture updated.'
      );

      setIsEditorOpen(false);
      setSelectedImageUrl('');
      setImageDimensions({
        width: 0,
        height: 0,
      });
      setZoom(1);
      setOffset({
        x: 0,
        y: 0,
      });

      sourceImageRef.current =
        null;

      dragStateRef.current =
        null;

      router.refresh();
    } catch (error) {
      console.error(
        'Profile avatar upload error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The profile picture could not be updated.'
      );
    } finally {
      setIsUploading(false);
    }
  }

  const initial =
    String(
      displayName || 'U'
    )
      .trim()
      .charAt(0)
      .toUpperCase() || 'U';

  const placement =
    getImagePlacement();

  const displayedLeft =
    (
      CROP_PREVIEW_SIZE -
      placement.width
    ) / 2 + offset.x;

  const displayedTop =
    (
      CROP_PREVIEW_SIZE -
      placement.height
    ) / 2 + offset.y;

  return (
    <>
      <div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '96px',
              height: '96px',
              flexShrink: 0,
            }}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={`${displayName} profile picture`}
                width={96}
                height={96}
                style={{
                  width: '96px',
                  height: '96px',
                  border:
                    '1px solid #e5e7eb',
                  borderRadius: '50%',
                  background: '#f2f4f7',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: '96px',
                  height: '96px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  borderRadius: '50%',
                  background: '#111827',
                  color: '#fff',
                  fontSize: '34px',
                  fontWeight: 'bold',
                }}
              >
                {initial}
              </div>
            )}

            {isLoadingImage && (
              <div
                aria-label="Opening profile picture"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  borderRadius: '50%',
                  background:
                    'rgba(17, 24, 39, 0.65)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                Opening…
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={
                isUploading ||
                isLoadingImage
              }
              style={{
                border:
                  '1px solid #d0d5dd',
                borderRadius: '8px',
                padding: '10px 16px',
                background:
                  isUploading ||
                  isLoadingImage
                    ? '#f2f4f7'
                    : '#fff',
                color:
                  isUploading ||
                  isLoadingImage
                    ? '#98a2b3'
                    : '#344054',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor:
                  isUploading ||
                  isLoadingImage
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {avatarSrc
                ? 'Change Photo'
                : 'Add Photo'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={
                handleFileChange
              }
              disabled={
                isUploading ||
                isLoadingImage
              }
              style={{
                display: 'none',
              }}
            />

            <p
              style={{
                margin:
                  '8px 0 0 0',
                color: '#667085',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              JPG, PNG, or WebP.
              Maximum 5 MB.
            </p>
          </div>
        </div>

        {errorMessage &&
          !isEditorOpen && (
          <div
            role="alert"
            style={{
              marginTop: '14px',
              padding: '10px 12px',
              border:
                '1px solid #fecdca',
              borderRadius: '8px',
              background: '#fef3f2',
              color: '#b42318',
              fontSize: '13px',
            }}
          >
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            style={{
              marginTop: '14px',
              padding: '10px 12px',
              border:
                '1px solid #a6f4c5',
              borderRadius: '8px',
              background: '#ecfdf3',
              color: '#067647',
              fontSize: '13px',
            }}
          >
            {successMessage}
          </div>
        )}
      </div>

      {isEditorOpen &&
        selectedImageUrl && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            padding: '20px',
            background:
              'rgba(16, 24, 40, 0.72)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-picture-editor-title"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              borderRadius: '16px',
              background: '#fff',
              boxShadow:
                '0 24px 48px rgba(16, 24, 40, 0.24)',
              fontFamily:
                'sans-serif',
            }}
          >
            <div
              style={{
                marginBottom: '20px',
              }}
            >
              <h2
                id="profile-picture-editor-title"
                style={{
                  margin:
                    '0 0 6px 0',
                  color: '#101828',
                  fontSize: '1.35rem',
                }}
              >
                Adjust Profile Picture
              </h2>

              <p
                style={{
                  margin: 0,
                  color: '#667085',
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}
              >
                Drag the image to
                reposition it and use
                the slider to zoom.
              </p>
            </div>

            <div
              onPointerDown={
                handlePointerDown
              }
              onPointerMove={
                handlePointerMove
              }
              onPointerUp={
                handlePointerEnd
              }
              onPointerCancel={
                handlePointerEnd
              }
              style={{
                position: 'relative',
                width:
                  `${CROP_PREVIEW_SIZE}px`,
                height:
                  `${CROP_PREVIEW_SIZE}px`,
                maxWidth: '100%',
                margin:
                  '0 auto 22px auto',
                overflow: 'hidden',
                borderRadius: '12px',
                background: '#101828',
                cursor: isUploading
                  ? 'wait'
                  : 'grab',
                touchAction: 'none',
                userSelect: 'none',
              }}
            >
              <img
                src={
                  selectedImageUrl
                }
                alt="Profile picture crop preview"
                draggable={false}
                style={{
                  position:
                    'absolute',
                  left:
                    `${displayedLeft}px`,
                  top:
                    `${displayedTop}px`,
                  width:
                    `${placement.width}px`,
                  height:
                    `${placement.height}px`,
                  maxWidth: 'none',
                  objectFit: 'fill',
                  pointerEvents:
                    'none',
                  userSelect: 'none',
                }}
              />

              <div
                aria-hidden="true"
                style={{
                  position:
                    'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  boxShadow:
                    '0 0 0 9999px rgba(16, 24, 40, 0.58)',
                  border:
                    '2px solid rgba(255, 255, 255, 0.95)',
                  pointerEvents:
                    'none',
                }}
              />

              {isUploading && (
                <div
                  role="status"
                  style={{
                    position:
                      'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    background:
                      'rgba(16, 24, 40, 0.58)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 'bold',
                  }}
                >
                  Saving…
                </div>
              )}
            </div>

            <label
              htmlFor="profile-picture-zoom"
              style={{
                display: 'block',
                marginBottom: '8px',
                color: '#344054',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              Zoom
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  color: '#667085',
                  fontSize: '13px',
                }}
              >
                −
              </span>

              <input
                id="profile-picture-zoom"
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                onChange={
                  handleZoomChange
                }
                disabled={isUploading}
                style={{
                  width: '100%',
                  cursor:
                    isUploading
                      ? 'not-allowed'
                      : 'pointer',
                }}
              />

              <span
                aria-hidden="true"
                style={{
                  color: '#667085',
                  fontSize: '18px',
                }}
              >
                +
              </span>
            </div>

            {errorMessage && (
              <div
                role="alert"
                style={{
                  marginBottom: '18px',
                  padding:
                    '10px 12px',
                  border:
                    '1px solid #fecdca',
                  borderRadius: '8px',
                  background:
                    '#fef3f2',
                  color: '#b42318',
                  fontSize: '13px',
                }}
              >
                {errorMessage}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={closeEditor}
                disabled={isUploading}
                style={{
                  border:
                    '1px solid #d0d5dd',
                  borderRadius: '8px',
                  padding:
                    '10px 16px',
                  background: '#fff',
                  color: '#344054',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor:
                    isUploading
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleSaveCrop
                }
                disabled={isUploading}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  padding:
                    '10px 18px',
                  background:
                    isUploading
                      ? '#98a2b3'
                      : '#0070f3',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor:
                    isUploading
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {isUploading
                  ? 'Saving…'
                  : 'Save Photo'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}