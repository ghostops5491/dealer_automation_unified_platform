import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, File, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './button';
import { uploadApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  accept?: string;
  maxSize?: number; // in MB (default: 4MB)
  disabled?: boolean;
  label?: string;
  error?: string;
  className?: string;
}

// Allowed file types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_MB = 4;

interface UploadedFile {
  url: string;
  originalName: string;
  size: number;
  mimetype: string;
}

export function FileUpload({
  value,
  onChange,
  accept = '.pdf,.jpg,.jpeg,.png',
  maxSize = MAX_FILE_SIZE_MB,
  disabled = false,
  label,
  error,
  className,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (mimetype?: string) => {
    if (!mimetype) return <File className="h-8 w-8 text-gray-400" />;
    if (mimetype.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (mimetype === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
    return <FileText className="h-8 w-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUpload = useCallback(async (file: File) => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only PDF, JPEG, and PNG files are allowed');
      return;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      setUploadError(`File size must be less than ${maxSize}MB`);
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const response = await uploadApi.uploadFile(file);
      const data = response.data.data;
      
      setUploadedFile({
        url: data.url,
        originalName: data.originalName,
        size: data.size,
        mimetype: data.mimetype,
      });
      onChange(data.url);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  }, [maxSize, onChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, [handleUpload]);

  const handleRemove = async () => {
    if (value) {
      try {
        await uploadApi.deleteFile(value);
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    }
    setUploadedFile(null);
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const displayError = error || uploadError;

  // If there's a value but no uploadedFile info, show as uploaded
  const hasFile = value || uploadedFile;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}

      {hasFile ? (
        // File Preview
        <div className="relative border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center gap-4">
            {getFileIcon(uploadedFile?.mimetype)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {uploadedFile?.originalName || 'Uploaded file'}
              </p>
              {uploadedFile?.size && (
                <p className="text-xs text-gray-500">
                  {formatFileSize(uploadedFile.size)}
                </p>
              )}
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span className="text-xs text-green-600">Uploaded</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {value && (
                <a
                  href={value.startsWith('http') ? value : `${window.location.origin}${value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  View
                </a>
              )}
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Upload Area
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 transition-colors',
            dragActive ? 'border-primary bg-primary/5' : 'border-gray-300',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50',
            displayError && 'border-red-300'
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={disabled ? undefined : handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled || isUploading}
            className="hidden"
          />
          
          <div className="flex flex-col items-center gap-2 text-center">
            {isUploading ? (
              <>
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm text-gray-600">Uploading...</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, JPEG, PNG only (max {maxSize}MB)
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}

