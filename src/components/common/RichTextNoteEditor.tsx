import React, { useEffect, useState, useRef } from 'react';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import {
  Stack,
  Text,
  Box,
  Button,
  Group,
  Modal,
  Menu,
} from '@mantine/core';
import {
  IconCopy,
  IconCheck,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconPhoto,
  IconUpload,
  IconLink,
} from '@tabler/icons-react';

/// <summary>
/// Compresses and converts an image File into a compact base64 data URL.
/// Downscales large images to a max dimension of 1600px and encodes to JPEG (0.85 quality)
/// to maintain crisp visual fidelity while saving local storage space.
/// </summary>
/// <param name="file">The image File to process.</param>
/// <returns>A Promise resolving to the base64 data URL string.</returns>
export async function compressAndConvertImage(file: File): Promise<string> {
  // If SVG or GIF, preserve vector / animation directly
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // If already small (under 100KB), direct base64
  if (file.size < 100 * 1024 && file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX_DIM = 1600;
        let { width, height } = img;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        // Keep transparent PNG if small and within bounds, otherwise fill white background for JPEG
        if (file.type === 'image/png' && file.size < 400 * 1024 && width <= 1200 && height <= 1200) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/// <summary>
/// Properties for configuring the RichTextNoteViewer component.
/// </summary>
export interface RichTextNoteViewerProps {
  /// <summary>Raw HTML or markdown/plain-text note string to render.</summary>
  content: string;
  /// <summary>Optional maximum height before scrolling.</summary>
  maxHeight?: number | string;
}

/// <summary>
/// Renders rich-text HTML formatted notes (from Tiptap/RTF) and code fragments.
/// If content is legacy plain text, it renders safely with preserved whitespace.
/// Supports clicking embedded images to open a full-resolution preview modal.
/// </summary>
export const RichTextNoteViewer: React.FC<RichTextNoteViewerProps> = ({ content, maxHeight }) => {
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!content || !content.trim()) {
    return (
      <Text size="xs" c="dimmed">
        No notes provided.
      </Text>
    );
  }

  const isHtml = /<\/?[a-z][\s\S]*>/i.test(content);

  /// <summary>
  /// Copies the note text or formatted content to clipboard.
  /// </summary>
  const handleCopyAll = async () => {
    try {
      const textToCopy = isHtml
        ? content.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n').trim()
        : content;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  /// <summary>
  /// Handles clicking on embedded images within the note to trigger full-size preview modal.
  /// </summary>
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'img') {
      const src = (target as HTMLImageElement).src;
      if (src) {
        setPreviewImage(src);
      }
    }
  };

  return (
    <Box style={{ position: 'relative' }}>
      <Box
        style={{
          maxHeight: maxHeight || undefined,
          overflowY: maxHeight ? 'auto' : undefined,
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      >
        {isHtml ? (
          <Box
            className="note-rich-content"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <Text size="xs" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {content}
          </Text>
        )}
      </Box>

      {content.length > 80 && (
        <Group justify="flex-end" mt={4}>
          <Button
            size="compact-xs"
            variant="subtle"
            color={copied ? 'teal' : 'gray'}
            leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            onClick={handleCopyAll}
          >
            {copied ? 'Copied' : 'Copy Text'}
          </Button>
        </Group>
      )}

      {/* Image Preview Modal */}
      <Modal
        opened={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title="Image Preview"
        size="xl"
        centered
      >
        {previewImage && (
          <Box style={{ textAlign: 'center' }}>
            <img
              src={previewImage}
              alt="Attachment preview"
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '8px',
                display: 'block',
                margin: '0 auto',
              }}
            />
            <Group justify="flex-end" mt="md">
              <Button
                variant="subtle"
                size="xs"
                component="a"
                href={previewImage}
                target="_blank"
                download="note-image.png"
              >
                Open Original / Download
              </Button>
            </Group>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

/// <summary>
/// Properties for configuring the RichTextNoteEditor component.
/// </summary>
export interface RichTextNoteEditorProps {
  /// <summary>Current HTML/RTF note value string.</summary>
  value: string;
  /// <summary>Callback triggered when note text changes.</summary>
  onChange: (val: string) => void;
  /// <summary>Optional label for the editor input.</summary>
  label?: string;
  /// <summary>Optional description text displayed above the input.</summary>
  description?: string;
  /// <summary>Optional placeholder string.</summary>
  placeholder?: string;
  /// <summary>Minimum height of the editor content area in pixels.</summary>
  minHeight?: number;
}

/// <summary>
/// Rich text editor powered by Mantine TipTap (@mantine/tiptap) supporting RTF
/// (bold, italic, underline, strike, headings, lists, blockquotes, images, paste & drop)
/// and code fragments with resizable and expandable editor height.
/// </summary>
export const RichTextNoteEditor: React.FC<RichTextNoteEditorProps> = ({
  value,
  onChange,
  label = 'Notes',
  description,
  minHeight = 130,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {},
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    editorProps: {
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItems = items.filter((item) => item.type.startsWith('image/'));
        if (imageItems.length > 0) {
          event.preventDefault();
          imageItems.forEach((item) => {
            const file = item.getAsFile();
            if (file) {
              compressAndConvertImage(file)
                .then((dataUrl) => {
                  const node = view.state.schema.nodes.image.create({ src: dataUrl });
                  const tr = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(tr);
                })
                .catch(console.error);
            }
          });
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
          if (files.length > 0) {
            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            files.forEach((file) => {
              compressAndConvertImage(file)
                .then((dataUrl) => {
                  const node = view.state.schema.nodes.image.create({ src: dataUrl });
                  const tr = view.state.tr;
                  if (coordinates) {
                    tr.insert(coordinates.pos, node);
                  } else {
                    tr.replaceSelectionWith(node);
                  }
                  view.dispatch(tr);
                })
                .catch(console.error);
            });
            return true;
          }
        }
        return false;
      },
    },
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // If editor is empty paragraph, emit empty string
      if (html === '<p></p>') {
        onChange('');
      } else {
        onChange(html);
      }
    },
  });

  // Keep editor content in sync when value changes from outside (e.g. task selection)
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentHtml = editor.getHTML();
      const targetVal = value || '';
      if (currentHtml !== targetVal && (currentHtml !== '<p></p>' || targetVal !== '')) {
        editor.commands.setContent(targetVal);
      }
    }
  }, [editor, value]);

  /// <summary>
  /// Handles selecting image files from local disk and inserting them into the editor.
  /// </summary>
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !editor) return;

    for (const file of files) {
      try {
        const dataUrl = await compressAndConvertImage(file);
        editor.chain().focus().setImage({ src: dataUrl }).run();
      } catch (err) {
        console.error('Failed to process image file:', err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /// <summary>
  /// Prompts user for an image URL and inserts it into the editor document.
  /// </summary>
  const handleInsertImageUrl = () => {
    const url = window.prompt('Enter image URL:');
    if (url && url.trim() && editor) {
      editor.chain().focus().setImage({ src: url.trim() }).run();
    }
  };

  const activeHeight = isExpanded ? 380 : minHeight;

  return (
    <Stack gap={4}>
      {/* Hidden file input for file picker upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <Group justify="space-between" align="center">
        <div>
          {label && (
            <Text size="sm" fw={500}>
              {label}
            </Text>
          )}
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </div>

        <Button
          size="compact-xs"
          variant="subtle"
          color="blue"
          leftSection={isExpanded ? <IconArrowsMinimize size={13} /> : <IconArrowsMaximize size={13} />}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
      </Group>

      <RichTextEditor editor={editor}>
        <RichTextEditor.Toolbar sticky stickyOffset={0}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.ClearFormatting />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Code />
            <RichTextEditor.CodeBlock />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.H1 />
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
            <RichTextEditor.Blockquote />
            <RichTextEditor.Hr />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Link />
            <RichTextEditor.Unlink />
          </RichTextEditor.ControlsGroup>

          {/* Image Upload & Insertion Controls */}
          <RichTextEditor.ControlsGroup>
            <Menu shadow="md" width={190} position="bottom-end">
              <Menu.Target>
                <RichTextEditor.Control
                  aria-label="Insert image"
                  title="Upload or insert image"
                >
                  <IconPhoto size={16} />
                </RichTextEditor.Control>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconUpload size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Image
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconLink size={14} />}
                  onClick={handleInsertImageUrl}
                >
                  Insert from URL
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Control
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <IconArrowsMinimize size={16} /> : <IconArrowsMaximize size={16} />}
            </RichTextEditor.Control>
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>

        <RichTextEditor.Content
          style={{
            minHeight: `${activeHeight}px`,
            fontSize: '13px',
          }}
        />
      </RichTextEditor>
    </Stack>
  );
};
