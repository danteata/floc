"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface FileUploaderProps {
    onUploadComplete?: (storageId: string, previewUrl?: string) => void;
    showPreview?: boolean;
}

export function FileUploader({ onUploadComplete, showPreview = false }: FileUploaderProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    // Convex Mutations
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);

    const handleFileSelect = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const file = files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast({
                title: "Unsupported file",
                description: "Please choose an image file (JPG, PNG or WebP).",
                variant: "destructive",
            });
            return;
        }

        // Validate file size (4MB limit)
        if (file.size > 4 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: "Please choose an image under 4MB.",
                variant: "destructive",
            });
            return;
        }

        setIsUploading(true);
        try {
            // 1. Get a short-lived upload URL from Convex
            const postUrl = await generateUploadUrl();

            // 2. POST the file to the URL
            const result = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
            });

            if (!result.ok) {
                throw new Error("Upload failed");
            }

            const { storageId } = await result.json();
            const previewUrl = URL.createObjectURL(file);
            setImageUrl(previewUrl);

            toast({
                title: "Photo uploaded",
                description: "Your image was saved.",
            });

            if (onUploadComplete) {
                onUploadComplete(storageId, previewUrl);
            }

        } catch (error: any) {
            console.error("Upload error:", error);
            toast({
                title: "Upload failed",
                description: error.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsUploading(false);
        }
    }, [generateUploadUrl, onUploadComplete, toast]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFileSelect(e.dataTransfer.files);
    }, [handleFileSelect]);

    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(e.target.files);
    }, [handleFileSelect]);

    return (
        <div className="w-full space-y-4">
            {/* Upload Area */}
            <div
                className={`
                    relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                    ${isDragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40'
                    }
                    ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                />

                <div className="flex flex-col items-center space-y-4">
                    {isUploading ? (
                        <>
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">Uploading…</p>
                                <p className="text-xs text-muted-foreground">This will only take a moment.</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="p-3 bg-muted rounded-full transition-colors">
                                <Upload className={`h-6 w-6 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                    {isDragOver ? 'Drop image here' : 'Click to upload'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    or drag and drop. JPG or PNG, up to 4 MB.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Preview Area (opt-in; parents usually show their own preview) */}
            {showPreview && imageUrl && (
                <div className="p-4 border border-border/50 bg-muted/50 rounded-xl relative shadow-sm animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 mb-3">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-xs text-foreground">File Preview</span>
                    </div>
                    <div className="relative inline-block border border-dashed border-border rounded-lg overflow-hidden bg-white/50">
                        <div className="w-full h-32 flex flex-col items-center justify-center p-6 text-center gap-2">
                            <ShieldCheck className="h-8 w-8 text-success-strong" />
                            <p className="text-[10px] text-muted-foreground">File secured successfully</p>
                            <p className="text-[9px] font-mono text-muted-foreground/70 bg-white px-2 py-0.5 rounded border border-border">ID: {imageUrl.substring(0, 16)}...</p>
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 rounded-full h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive-strong transition-colors"
                            onClick={() => {
                                setImageUrl(null);
                                if (onUploadComplete) {
                                    onUploadComplete("");
                                }
                            }}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
