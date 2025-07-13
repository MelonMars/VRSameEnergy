const { useState, useRef, useEffect, useCallback } = React;

const CanvasEditor = () => {
  const canvasRef = useRef(null);
  const [layers, setLayers] = useState([]);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [tool, setTool] = useState('move');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [history, setHistory] = useState([]);
  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState(null);
  const [cropEnd, setCropEnd] = useState(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const hasLoaded = useRef(false)
  const [snapLines, setSnapLines] = useState([]);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [pngBackgroundType, setPngBackgroundType] = useState('transparent');
  const [pngBackgroundColor, setPngBackgroundColor] = useState('#ffffff');
  const [uploadProjectModalOpen, setUploadProjectModalOpen] = useState(false);
  const [markerOptions, setMarkerOptions] = useState({ color: '#000000', strokeWidth: 5 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [showGrid, setShowGrid] = useState(true);
  const drawingCanvasRef = useRef(null);
  const [contextMenu, setContextMenu] = useState({
    x: 0,
    y: 0,
    layerId: null
  });

  useEffect(() => {
    if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
        if (layers.length > 0) {
            const stateToSave = {
                viewport: viewport,
                layers: layers.map(layer => ({
                    id: layer.id,
                    x: layer.x, y: layer.y,
                    width: layer.width, height: layer.height,
                    visible: layer.visible, name: layer.name,
                    imageUrl: layer.image.src,
                    originalImageUrl: layer.originalImage.src,
                    hasTransparency: layer.hasTransparency
                }))
            };
            localStorage.setItem('canvasState', JSON.stringify(stateToSave));
        } else {
            localStorage.removeItem('canvasState');
        }
    }, 500);

    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [layers, viewport]);

  useEffect(() => {
    console.log("Is drawing modified:", isDrawing);
  }, [isDrawing]);

  useEffect(() => {
    if (hasLoaded.current) return
    hasLoaded.current = true

    console.log("Loading and syncing canvas state...");
    const loadAndSyncState = async () => {
        setIsProcessing(true);

        const savedStateString = localStorage.getItem('canvasState');
        const inspirationBoardString = localStorage.getItem('vrInspirationBoard');
        const initialImagesString = sessionStorage.getItem('initialCanvasImages'); 

        const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous"; 
            img.onload = () => resolve(img);
            img.onerror = (err) => {
                console.error(`Failed to load image: ${url}`, err);
                reject(err);
            };
            img.src = url;
        });

        let layersToSet = [];
        let viewportToSet = { x: 0, y: 0, scale: 1 };

        if (savedStateString) {
            console.log("Restoring canvas state from localStorage...");
            const savedState = JSON.parse(savedStateString);
            
            const restoredLayers = await Promise.all(
                savedState.layers.map(async (layerData) => {
                    try {
                        const [image, originalImage] = await Promise.all([
                            loadImageFromUrl(layerData.imageUrl),
                            loadImageFromUrl(layerData.originalImageUrl)
                        ]);
                        return { ...layerData, image, originalImage };
                    } catch (error) { return null; }
                })
            );
            layersToSet = restoredLayers.filter(Boolean);
            viewportToSet = savedState.viewport;

            if (initialImagesString) {
                const initialImageUrls = JSON.parse(initialImagesString);
                const existingOriginalUrls = new Set(layersToSet.map(l => l.originalImage.src));
                const newImageUrls = initialImageUrls.filter(url => !existingOriginalUrls.has(url));

                if (newImageUrls.length > 0) {
                    console.log(`Syncing: Adding ${newImageUrls.length} missing initial images.`);
                    const newLayers = await Promise.all(
                        newImageUrls.map(async (url, index) => {
                            try {
                                const img = await loadImageFromUrl(url);
                                return {
                                    id: Date.now() + Math.random() + index,
                                    image: img, originalImage: img,
                                    x: (layersToSet.length + index) * 50,
                                    y: (layersToSet.length + index) * 50,
                                    width: img.width, height: img.height,
                                    visible: true, name: `Layer ${layersToSet.length + index + 1}`,
                                    hasTransparency: false
                                };
                            } catch (error) { return null; }
                        })
                    );
                    console.log(`Syncing: Added ${newLayers.length} new layers from initial images.`);
                    layersToSet.push(...newLayers.filter(Boolean));
                }
                sessionStorage.removeItem('initialCanvasImages');
            } 

        } else if (initialImagesString) {
            console.log("Loading initial images from sessionStorage...");
            const imageUrls = JSON.parse(initialImagesString);
            const initialLayers = await Promise.all(
                imageUrls.map(async (url, index) => {
                    try {
                        const img = await loadImageFromUrl(url);
                        return {
                            id: Date.now() + Math.random() + index,
                            image: img, originalImage: img,
                            x: index * 50, y: index * 50,
                            width: img.width, height: img.height,
                            visible: true, name: `Layer ${index + 1}`,
                            hasTransparency: false
                        };
                    } catch (error) { return null; }
                })
            );
            layersToSet = initialLayers.filter(Boolean);
            sessionStorage.removeItem('initialCanvasImages');
        }

        setLayers(layersToSet);
        setViewport(viewportToSet);

        if (inspirationBoardString) {
            const inspirationBoard = JSON.parse(inspirationBoardString);
            const existingLayerIds = new Set(layersToSet.map(l => l.id));

            const newItemsToLoad = inspirationBoard.filter(
                item => !existingLayerIds.has(item.id)
            );

            if (newItemsToLoad.length > 0) {
                console.log(`Syncing: Found ${newItemsToLoad.length} new items from the inspiration board.`);
                
                const newLayersFromBoard = await Promise.all(
                    newItemsToLoad.map(async (item, index) => {
                        try {
                            const img = await loadImageFromUrl(item.imageUrl);
                            return {
                                id: item.id,
                                image: img, originalImage: img,
                                x: (layersToSet.length + index) * 50,
                                y: (layersToSet.length + index) * 50,
                                width: img.width, height: img.height,
                                visible: true, name: item.name || `Synced Layer ${index + 1}`,
                                hasTransparency: false
                            };
                        } catch (error) { return null; }
                    })
                );
                
                setLayers(prevLayers => [...prevLayers, ...newLayersFromBoard.filter(Boolean)]);
            } else {
                console.log("Syncing: Canvas is already up to date with the inspiration board.");
            }
        }
        setIsProcessing(false);
    };

    loadAndSyncState();
  }, []);

  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), { layers: JSON.parse(JSON.stringify(layers)), viewport: { ...viewport } }]);
  }, [layers, viewport]);

  const undo = useCallback(() => {
    if (history.length > 0) {
      const lastState = history[history.length - 1];
      setLayers(lastState.layers);
      setViewport(lastState.viewport);
      setHistory(prev => prev.slice(0, -1));
    }
  }, [history]);

  const screenToCanvas = useCallback((x, y) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (x - rect.left - viewport.x) / viewport.scale,
      y: (y - rect.top - viewport.y) / viewport.scale
    };
  }, [viewport]);

  const canvasToScreen = useCallback((x, y) => {
    return {
      x: x * viewport.scale + viewport.x,
      y: y * viewport.scale + viewport.y
    };
  }, [viewport]);


  const loadImage = useCallback((file) => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        img.onload = () => resolve(img);
        img.src = e.target.result;
      };
      
      reader.readAsDataURL(file);
    });
  }, []);

  const addLayer = useCallback(async (image, x = 0, y = 0, skipBackgroundDetection = false) => {
    setIsProcessing(true);
    saveToHistory();
    
    let processedImage = image;
    let layerName = 'Layer';
        
    const newLayer = {
      id: Date.now() + Math.random(),
      image: processedImage,
      originalImage: image,
      x,
      y,
      width: processedImage.width,
      height: processedImage.height,
      visible: true,
      name: layerName,
      hasTransparency: false
    };
    
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayer(newLayer.id);
    setIsProcessing(false);
  }, [saveToHistory]);

  const handleFileUpload = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    console.log("Handling file upload for images:", imageFiles);
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const img = await loadImage(file);
      const offset = i * 50;
      await addLayer(img, offset, offset);
    }
  }, [loadImage, addLayer]);

  const handleDrop = useCallback((e) => {
    console.log("Handling file drop...");
    e.preventDefault();
    console.log("Dropping in files: ", e.dataTransfer.files);
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
  }, [handleFileUpload]);

  const handlePaste = useCallback(async (e) => {
    console.log("Pasting in images...");
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    for (let i = 0; i < imageItems.length; i++) {
      const item = imageItems[i];
      const file = item.getAsFile();
      const img = await loadImage(file);
      const offset = i * 50;
      await addLayer(img, offset, offset);
    }
  }, [loadImage, addLayer]);

  const getLayerAtPosition = useCallback((x, y) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.visible && 
          x >= layer.x && x <= layer.x + layer.width &&
          y >= layer.y && y <= layer.y + layer.height) {
        return layer;
      }
    }
    return null;
  }, [layers]);

  const createHoleInLayer = useCallback((layer, cropX, cropY, cropWidth, cropHeight) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = layer.width;
    canvas.height = layer.height;
    
    ctx.drawImage(layer.image, 0, 0);
    
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(cropX, cropY, cropWidth, cropHeight);
    
    const newImage = new Image();
    newImage.onload = () => {
      setLayers(prev => prev.map(l => 
        l.id === layer.id 
          ? { ...l, image: newImage, name: l.name + ' (Cropped)' }
          : l
      ));
    };
    newImage.src = canvas.toDataURL();
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) {
      return;
    }

    if (contextMenu.layerId) {
      setContextMenu({ x: 0, y: 0, layerId: null });
    }

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    
    if (tool === 'eraser' ) {
      setIsDrawing(true);
      const layerToDelete = getLayerAtPosition(canvasPos.x, canvasPos.y);
      if (layerToDelete) {
        setLayers(prev => prev.filter(l => l.id !== layerToDelete.id));
        saveToHistory();
      }
    } else if (tool === 'marker') {
      console.log("Starting marker drawing at position:", canvasPos);
      setIsDrawing(true);
      setDrawingPoints([canvasPos]);
    } else if (tool === 'move') {
      const layer = getLayerAtPosition(canvasPos.x, canvasPos.y);
      if (layer) {
        if (!e.shiftKey) {
          setSelectedLayer(layer.id);
        }
        setIsDragging(true);
        setDragStart({ x: canvasPos.x - layer.x, y: canvasPos.y - layer.y });
      } else {
        if (!e.shiftKey) {
          setSelectedLayer(null);
        }
        setIsDragging(true);
        setDragStart({ x: canvasPos.x, y: canvasPos.y });
      }
    } else if (tool === 'crop' && selectedLayer) {
      setCropMode(true);
      setCropStart(canvasPos);
      setCropEnd(canvasPos);
    }
  }, [tool, selectedLayer, screenToCanvas, getLayerAtPosition]);

  const handleMouseMove = useCallback((e) => {
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    
    if (isDrawing && tool === 'marker') {
      setDrawingPoints(prev => [...prev, canvasPos]);
      return;
    }
    
    if (isDragging && tool === 'move') {
        const snapThreshold = 10 / viewport.scale;
        const gridSize = 50;

        if (selectedLayer) {
            let newX = canvasPos.x - dragStart.x;
            let newY = canvasPos.y - dragStart.y;
            const currentLayer = layers.find(l => l.id === selectedLayer);
            
            if (currentLayer && showGrid) { 
                const layerEdges = {
                    x: [newX, newX + currentLayer.width / 2, newX + currentLayer.width],
                    y: [newY, newY + currentLayer.height / 2, newY + currentLayer.height]
                };

                const newSnapLines = [];

                for (const x of layerEdges.x) {
                    const snappedX = Math.round(x / gridSize) * gridSize;
                    if (Math.abs(x - snappedX) < snapThreshold) {
                        newX += snappedX - x;
                        newSnapLines.push({ type: 'v', x: snappedX });
                        break; 
                    }
                }

                for (const y of layerEdges.y) {
                    const snappedY = Math.round(y / gridSize) * gridSize;
                    if (Math.abs(y - snappedY) < snapThreshold) {
                        newY += snappedY - y;
                        newSnapLines.push({ type: 'h', y: snappedY });
                        break;
                    }
                }
                setSnapLines(newSnapLines);
            }

            setLayers(prev => prev.map(layer =>
                layer.id === selectedLayer
                    ? { ...layer, x: newX, y: newY }
                    : layer
            ));
        } else {
            setViewport(prev => ({
                ...prev,
                x: prev.x + (canvasPos.x - dragStart.x) * viewport.scale,
                y: prev.y + (canvasPos.y - dragStart.y) * viewport.scale
            }));
        }
    } else if (cropMode && tool === 'crop') {
        setCropEnd(canvasPos);
    } else if (tool === 'eraser' && isDrawing && drawingCanvasRef.current) {
      const layerToDelete = getLayerAtPosition(canvasPos.x, canvasPos.y);
      if (layerToDelete) {
        setLayers(prev => prev.filter(l => l.id !== layerToDelete.id));
      }
    }
  }, [isDrawing, isDragging, tool, selectedLayer, dragStart, cropMode, screenToCanvas, viewport.scale, layers, showGrid]);

  const handleMouseUp = useCallback(() => {
    if (isDrawing && tool === 'eraser' && drawingCanvasRef.current) {
      saveToHistory();
    } else if (isDrawing && tool === 'marker' && drawingPoints.length > 1) {
      const actualStrokeWidth = markerOptions.strokeWidth / viewport.scale;
      const padding = actualStrokeWidth;

      const minX = Math.min(...drawingPoints.map(p => p.x)) - padding;
      const minY = Math.min(...drawingPoints.map(p => p.y)) - padding;
      const maxX = Math.max(...drawingPoints.map(p => p.x)) + padding;
      const maxY = Math.max(...drawingPoints.map(p => p.y)) + padding;

      const width = maxX - minX;
      const height = maxY - minY;
      
      const drawingCanvas = document.createElement('canvas');
      drawingCanvas.width = width;
      drawingCanvas.height = height;
      const ctx = drawingCanvas.getContext('2d');
      
      ctx.strokeStyle = markerOptions.color;
      ctx.lineWidth = actualStrokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(drawingPoints[0].x - minX, drawingPoints[0].y - minY);
      for (let i = 1; i < drawingPoints.length; i++) {
          ctx.lineTo(drawingPoints[i].x - minX, drawingPoints[i].y - minY);
      }
      ctx.stroke();

      const newImage = new Image();
      newImage.onload = () => {
          addLayer(newImage, minX, minY, true);
      };
      newImage.src = drawingCanvas.toDataURL();
    }
    
    setIsDrawing(false);
    setDrawingPoints([]);

    if (isDragging && tool === 'move' && selectedLayer) {
      saveToHistory();
    }
    setIsDragging(false);
    setSnapLines([]);
    
    if (cropMode && tool === 'crop' && cropStart && cropEnd && selectedLayer) {
      const layer = layers.find(l => l.id === selectedLayer);
      if (layer) {
        const x1 = Math.min(cropStart.x, cropEnd.x) - layer.x;
        const y1 = Math.min(cropStart.y, cropEnd.y) - layer.y;
        const x2 = Math.max(cropStart.x, cropEnd.x) - layer.x;
        const y2 = Math.max(cropStart.y, cropEnd.y) - layer.y;
        
        if (x1 >= 0 && y1 >= 0 && x2 <= layer.width && y2 <= layer.height && x2 > x1 && y2 > y1) {
          const croppedCanvas = document.createElement('canvas');
          const croppedCtx = croppedCanvas.getContext('2d');
          croppedCanvas.width = x2 - x1;
          croppedCanvas.height = y2 - y1;
          
          croppedCtx.drawImage(
            layer.image,
            x1, y1, x2 - x1, y2 - y1,
            0, 0, x2 - x1, y2 - y1
          );
          
          const croppedImage = new Image();
          croppedImage.onload = () => {
            addLayer(croppedImage, layer.x + x1, layer.y + y1, true);
            createHoleInLayer(layer, x1, y1, x2 - x1, y2 - y1);
          };
          croppedImage.src = croppedCanvas.toDataURL();
        }
      }
      setCropMode(false);
      setCropStart(null);
      setCropEnd(null);
    }
  }, [isDrawing, drawingPoints, markerOptions, isDragging, tool, selectedLayer, cropMode, cropStart, cropEnd, layers, saveToHistory, addLayer, createHoleInLayer]);

  const copyLayer = useCallback(async () => {
    if (selectedLayer) {
      const layer = layers.find(l => l.id === selectedLayer);
      if (layer) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = layer.width;
        canvas.height = layer.height;
        ctx.drawImage(layer.image, 0, 0);
        
        canvas.toBlob(async (blob) => {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
          } catch (err) {
            console.error('Failed to copy to clipboard:', err);
          }
        });
      }
    }
  }, [selectedLayer, layers]);

    const deleteLayer = useCallback(() => {
        if (selectedLayer) {
            saveToHistory();

            const inspirationBoardString = localStorage.getItem('vrInspirationBoard') || '[]';
            const inspirationBoard = JSON.parse(inspirationBoardString);

            const updatedBoard = inspirationBoard.filter(item => item.id !== selectedLayer);

            localStorage.setItem('vrInspirationBoard', JSON.stringify(updatedBoard));

            setLayers(prev => prev.filter(l => l.id !== selectedLayer));
            setSelectedLayer(null);
        }
    }, [selectedLayer, saveToHistory]);


  const toggleLayerVisibility = useCallback((layerId) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId 
        ? { ...layer, visible: !layer.visible }
        : layer
    ));
  }, []);

  const duplicateLayer = useCallback(() => {
    if (selectedLayer) {
      const layer = layers.find(l => l.id === selectedLayer);
      if (layer) {
        addLayer(layer.image, layer.x + 20, layer.y + 20, true);
      }
    }
  }, [selectedLayer, layers, addLayer]);

  const zoomIn = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
  }, []);

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.scale, viewport.scale);
    
    if (showGrid) {
      const checkerSize = 20;
      const startX = Math.floor(-viewport.x / viewport.scale / checkerSize) * checkerSize;
      const startY = Math.floor(-viewport.y / viewport.scale / checkerSize) * checkerSize;
      const endX = startX + (canvas.width / viewport.scale) + checkerSize;
      const endY = startY + (canvas.height / viewport.scale) + checkerSize;
      
      for (let x = startX; x < endX; x += checkerSize) {
        for (let y = startY; y < endY; y += checkerSize) {
          ctx.fillStyle = ((x / checkerSize) + (y / checkerSize)) % 2 === 0 ? '#f0f0f0' : '#e0e0e0';
          ctx.fillRect(x, y, checkerSize, checkerSize);
        }
      }
      
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 1 / viewport.scale;
      const gridSize = 50;
      
      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }
    }
    
    layers.forEach(layer => {
      if (layer.visible) {
        if (isDrawing && tool === 'eraser' && drawingCanvasRef.current?.layerId === layer.id) {
          ctx.drawImage(drawingCanvasRef.current.canvas, layer.x, layer.y);
        } else {
          ctx.drawImage(layer.image, layer.x, layer.y, layer.width, layer.height);
        }
        
        if (layer.id === selectedLayer) {
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2 / viewport.scale;
          ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
          
          const handleSize = 8 / viewport.scale;
          ctx.fillStyle = '#2563eb';
          const positions = [
            [layer.x, layer.y],
            [layer.x + layer.width, layer.y],
            [layer.x + layer.width, layer.y + layer.height],
            [layer.x, layer.y + layer.height]
          ];
          positions.forEach(([x, y]) => {
            ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
          });
        }
      }
    });
    
    if (isDrawing && tool === 'marker' && drawingPoints.length > 1) {
      ctx.strokeStyle = markerOptions.color;
      ctx.lineWidth = markerOptions.strokeWidth / viewport.scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
      for (let i = 1; i < drawingPoints.length; i++) {
          ctx.lineTo(drawingPoints[i].x, drawingPoints[i].y);
      }
      ctx.stroke();
    }

    if (snapLines.length > 0) {
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1 / viewport.scale;
      ctx.setLineDash([5 / viewport.scale, 5 / viewport.scale]);

      snapLines.forEach(line => {
          ctx.beginPath();
          if (line.type === 'v') {
              ctx.moveTo(line.x, -viewport.y / viewport.scale);
              ctx.lineTo(line.x, (canvas.height - viewport.y) / viewport.scale);
          } else {
              ctx.moveTo(-viewport.x / viewport.scale, line.y);
              ctx.lineTo((canvas.width - viewport.x) / viewport.scale, line.y);
          }
          ctx.stroke();
      });

      ctx.setLineDash([]);
    }

    if (cropMode && cropStart && cropEnd) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2 / viewport.scale;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      const x = Math.min(cropStart.x, cropEnd.x);
      const y = Math.min(cropStart.y, cropEnd.y);
      const w = Math.abs(cropEnd.x - cropStart.x);
      const h = Math.abs(cropEnd.y - cropStart.y);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    
    ctx.restore();
  }, [layers, selectedLayer, viewport, cropMode, cropStart, cropEnd, isDrawing, tool, drawingPoints, markerOptions, snapLines, showGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', preventDefaults, false);
    window.addEventListener('drop', preventDefaults, false);

    const handleWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, viewport.scale * scaleFactor));

      setViewport(prev => ({
        x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
        y: mouseY - (mouseY - prev.y) * (newScale / prev.scale),
        scale: newScale
      }));
    };

    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            undo();
            break;
          case 'c':
            e.preventDefault();
            copyLayer();
            break;
          case 'd':
            e.preventDefault();
            duplicateLayer();
            break;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteLayer();
      }
    };

    canvas.addEventListener('wheel', handleWheel);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);

      canvas.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('paste', handlePaste);
    };
  }, [viewport, undo, copyLayer, deleteLayer, duplicateLayer, handlePaste]);

  const downloadProject = () => {
    setDownloadModalOpen(true);
  }

  const uploadProject = () => {
    setUploadProjectModalOpen(true);
  }

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    const layer = getLayerAtPosition(canvasPos.x, canvasPos.y);

    if (layer) {
      setSelectedLayer(layer.id);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        layerId: layer.id,
      });
    } else {
      setContextMenu({ x: 0, y: 0, layerId: null });
    }
  }, [screenToCanvas, getLayerAtPosition, layers]);

  return (
    <div className="w-full h-screen bg-gray-100 flex">
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Layers</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {layers.map((layer, index) => (
            <div
              key={layer.id}
              className={`p-3 border-b border-gray-100 cursor-pointer ${
                layer.id === selectedLayer ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
              }`}
              onClick={() => setSelectedLayer(layer.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  layerId: layer.id
                });
              }}    
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerVisibility(layer.id);
                    }}
                    className={`w-5 h-5 rounded ${
                      layer.visible ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    }`}
                  >
                    {layer.visible ? '👁' : ''}
                  </button>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {layer.name} {layer.hasTransparency && '✨'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {layer.width}×{layer.height}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-4 flex-wrap">
        <a href="vr.html" className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                  <path d="M9 12H3"/>
              </svg>
              Back to VR
          </a>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" x2="12" y1="3" y2="15"/>
            </svg>
            Upload Images
          </button>
          
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <button
              onClick={() => setTool('move')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                tool === 'move' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
              </svg>
              Move
            </button>
            <button
              onClick={() => setTool('crop')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                tool === 'crop' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
                <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
              </svg>
              Crop & Excise
            </button>
            <button
              onClick={() => setTool('marker')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                tool === 'marker' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pen-icon lucide-pen"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
              Marker
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                tool === 'eraser' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser-icon lucide-eraser"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/></svg>
            </button>
            {tool == 'marker' && (<div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Stroke Width:</label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={markerOptions.strokeWidth}
                  onChange={(e) => setMarkerOptions((prev) => ({ ...prev, strokeWidth: parseInt(e.target.value, 10) }))}
                  className="w-24"
                />
                <span className="text-sm text-gray-600">{markerOptions.strokeWidth}px</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Color:</label>
                <input
                  type="color"
                  value={markerOptions.color}
                  onChange={(e) => setMarkerOptions((prev) => ({ ...prev, color: e.target.value }))}
                  className="w-8 h-8 border rounded cursor-pointer"
                />
              </div>
            </div>)}
          </div>
          
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <button
              onClick={copyLayer}
              disabled={!selectedLayer}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Copy
            </button>
            <button
              onClick={duplicateLayer}
              disabled={!selectedLayer}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Duplicate
            </button>
            <button
              onClick={deleteLayer}
              disabled={!selectedLayer}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-100 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                <line x1="10" x2="10" y1="11" y2="17"/>
                <line x1="14" x2="14" y1="11" y2="17"/>
              </svg>
              Delete
            </button>
            <button
              onClick={undo}
              disabled={history.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14 4 9l5-5"/>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
              </svg>
              Undo
            </button>
            <button
              onClick={downloadProject}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
              Download
            </button>
            <button
              onClick={uploadProject}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
              Upload
            </button>
          </div>
          
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <button
              onClick={zoomOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" x2="16.65" y1="21" y2="16.65"/>
                <line x1="8" x2="14" y1="11" y2="11"/>
              </svg>
            </button>
            <span className="text-sm font-medium min-w-16 text-center">
              {Math.round(viewport.scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" x2="16.65" y1="21" y2="16.65"/>
                <line x1="11" x2="11" y1="8" y2="14"/>
                <line x1="8" x2="14" y1="11" y2="11"/>
              </svg>
            </button>
            <button
              onClick={resetView}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
              Reset
            </button>
          </div>
          
          <div className="text-sm text-gray-600 border-l border-gray-200 pl-4">
            Layers: {layers.length} | Selected: {selectedLayer ? 'Yes' : 'None'}
            {isProcessing && <span className="text-blue-600"> | Processing...</span>}
          </div>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => {
                setShowGrid(e.target.checked)
              }}
              className="cursor-pointer"
            />
            <label className="text-sm text-gray-600 cursor-pointer">Show Grid</label>
          </div>
        </div>
        
        <div className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            width={window.innerWidth - 256}
            height={window.innerHeight - 100}
            className="absolute inset-0 cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDrop={handleDrop}
            onDragEnter={(e) => e.preventDefault()}
            onDragOver={(e) => e.preventDefault()}
            onContextMenu={handleContextMenu}
          />
          
          {layers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-gray-500">
                <p className="text-lg font-semibold mb-2">Drop images here or click Upload</p>
                <p className="text-sm mb-2">You can also paste multiple images with Ctrl+V</p>
                <p className="text-xs text-gray-400">
                  • Images with uniform backgrounds will be auto-processed<br/>
                  • Use Crop & Excise to cut out parts and remove them from source<br/>
                  • Hold Shift to multi-select layers
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      {downloadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">Download Project</h2>
            <p className="text-sm text-gray-600 mb-4">
              Would you like to download as PNG or JSON? The PNG will include all visible layers merged together, while the JSON will save the current state of the canvas including all layers and their properties.
            </p>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PNG Background:
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="background"
                    value="transparent"
                    checked={pngBackgroundType === 'transparent'}
                    onChange={(e) => setPngBackgroundType(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">Transparent</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="background"
                    value="colored"
                    checked={pngBackgroundType === 'colored'}
                    onChange={(e) => setPngBackgroundType(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm">Colored background</span>
                </label>
              </div>
              
              {pngBackgroundType === 'colored' && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm text-gray-600">Color:</label>
                  <input
                    type="color"
                    value={pngBackgroundColor}
                    onChange={(e) => setPngBackgroundColor(e.target.value)}
                    className="w-8 h-8 border rounded cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">{pngBackgroundColor}</span>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDownloadModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const padding = 20;
                  const canvas = canvasRef.current;
                  if (!canvas) return;

                  const ctx = canvas.getContext('2d');
                  const visibleLayers = layers.filter(layer => layer.visible);

                  if (visibleLayers.length === 0) return;

                  const minX = Math.min(...visibleLayers.map(layer => layer.x)) - padding;
                  const minY = Math.min(...visibleLayers.map(layer => layer.y)) - padding;
                  const maxX = Math.max(...visibleLayers.map(layer => layer.x + layer.width)) + padding;
                  const maxY = Math.max(...visibleLayers.map(layer => layer.y + layer.height)) + padding;

                  const exportWidth = maxX - minX;
                  const exportHeight = maxY - minY;

                  const exportCanvas = document.createElement('canvas');
                  exportCanvas.width = exportWidth;
                  exportCanvas.height = exportHeight;
                  const exportCtx = exportCanvas.getContext('2d');

                  exportCtx.clearRect(0, 0, exportWidth, exportHeight);

                  if (pngBackgroundType === 'colored') {
                    exportCtx.fillStyle = pngBackgroundColor;
                    exportCtx.fillRect(0, 0, exportWidth, exportHeight);
                  }

                  visibleLayers.forEach(layer => {
                    exportCtx.drawImage(
                      layer.image,
                      layer.x - minX,
                      layer.y - minY,
                      layer.width,
                      layer.height
                    );
                  });

                  const dataUrl = exportCanvas.toDataURL('image/png');
                  const a = document.createElement('a');
                  a.download = 'canvas-project.png';
                  a.href = dataUrl;
                  a.click();
                  setDownloadModalOpen(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-image-icon lucide-file-image">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                  <circle cx="10" cy="12" r="2"/>
                  <path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>
                </svg>
                PNG
              </button>

              <button
                onClick={async () => {
                  setDownloadModalOpen(false);
                  
                  const convertToDataUrl = (url) => {
                    return new Promise((resolve, reject) => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                      };
                      img.onerror = () => {
                        console.warn(`Failed to load image: ${url}`);
                        resolve(null);
                      };
                      img.src = url;
                    });
                  };

                  const layersWithEmbeddedImages = await Promise.all(
                    layers.map(async (layer) => {
                      const layerCopy = { ...layer };
                      
                      if (layer.imageUrl) {
                        try {
                          const dataUrl = await convertToDataUrl(layer.imageUrl);
                          layerCopy.imageDataUrl = dataUrl;
                        } catch (error) {
                          console.warn(`Failed to convert imageUrl for layer ${layer.id}:`, error);
                        }
                      }
                      
                      if (layer.originalImageUrl && layer.originalImageUrl !== layer.imageUrl) {
                        try {
                          const originalDataUrl = await convertToDataUrl(layer.originalImageUrl);
                          layerCopy.originalImageDataUrl = originalDataUrl;
                        } catch (error) {
                          console.warn(`Failed to convert originalImageUrl for layer ${layer.id}:`, error);
                        }
                      } else if (layer.originalImageUrl === layer.imageUrl && layerCopy.imageDataUrl) {
                        layerCopy.originalImageDataUrl = layerCopy.imageDataUrl;
                      }
                      
                      return layerCopy;
                    })
                  );

                  const exportData = {
                    layers: layersWithEmbeddedImages,
                    viewport,
                    exportInfo: {
                      timestamp: new Date().toISOString(),
                      version: '1.0',
                      includesEmbeddedImages: true
                    }
                  };

                  const json = JSON.stringify(exportData, null, 2);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'canvas-project.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-cog-icon lucide-file-cog">
                  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                  <path d="m2.305 15.53.923-.382"/>
                  <path d="m3.228 12.852-.924-.383"/>
                  <path d="M4.677 21.5a2 2 0 0 0 1.313.5H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v2.5"/>
                  <path d="m4.852 11.228-.383-.923"/>
                  <path d="m4.852 16.772-.383.924"/>
                  <path d="m7.148 11.228.383-.923"/>
                  <path d="m7.53 17.696-.382-.924"/>
                  <path d="m8.772 12.852.923-.383"/>
                  <path d="m8.772 15.148.923.383"/>
                  <circle cx="6" cy="14" r="3"/>
                </svg>
                JSON
              </button>
            </div>
          </div>
        </div>
      )}
      {uploadProjectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">Upload Project</h2>
            <p className="text-sm text-gray-600 mb-4">
              Select a JSON file exported from the canvas editor to restore your project.
            </p>
            
            <div className="mb-4">
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  
                  try {
                    const text = await file.text();
                    const projectData = JSON.parse(text);
                    
                    if (!projectData.layers || !Array.isArray(projectData.layers)) {
                      throw new Error('Invalid project file structure');
                    }
                    
                    setIsProcessing(true);
                    
                    const loadedLayers = await Promise.all(
                      projectData.layers.map(async (layerData) => {
                        try {
                          const loadImageFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => resolve(img);
                            img.onerror = reject;
                            img.src = dataUrl;
                          });
                          
                          let image, originalImage;
                          
                          if (layerData.imageDataUrl) {
                            image = await loadImageFromDataUrl(layerData.imageDataUrl);
                          } else if (layerData.imageUrl) {
                            image = await loadImageFromDataUrl(layerData.imageUrl);
                          } else {
                            throw new Error('No image data found');
                          }
                          
                          if (layerData.originalImageDataUrl) {
                            originalImage = await loadImageFromDataUrl(layerData.originalImageDataUrl);
                          } else if (layerData.originalImageUrl) {
                            originalImage = await loadImageFromDataUrl(layerData.originalImageUrl);
                          } else {
                            originalImage = image;
                          }
                          
                          return {
                            id: layerData.id,
                            image,
                            originalImage,
                            x: layerData.x,
                            y: layerData.y,
                            width: layerData.width,
                            height: layerData.height,
                            visible: layerData.visible !== false,
                            name: layerData.name || 'Imported Layer',
                            hasTransparency: layerData.hasTransparency || false
                          };
                        } catch (error) {
                          console.warn(`Failed to load layer ${layerData.id}:`, error);
                          return null;
                        }
                      })
                    );
                    
                    const validLayers = loadedLayers.filter(Boolean);
                    
                    if (validLayers.length === 0) {
                      throw new Error('No valid layers found in the project file');
                    }
                    
                    setLayers(validLayers);
                    if (projectData.viewport) {
                      setViewport(projectData.viewport);
                    }
                    
                    setIsProcessing(false);
                    setUploadProjectModalOpen(false);
                    
                  } catch (error) {
                    console.error('Failed to load project:', error);
                    alert('Failed to load project file. Please make sure it\'s a valid JSON export from the canvas editor.');
                    setIsProcessing(false);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                id="project-file-input"
              />
              <label
                htmlFor="project-file-input"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-all duration-200"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                  </svg>
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">JSON project files only</p>
                </div>
              </label>
            </div>
          </div>            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setUploadProjectModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {contextMenu.layerId && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg p-2"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu({})}
        >
          <button
            className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              toggleLayerVisibility(contextMenu.layerId);
              setContextMenu({});
            }}
          >
            {layers.find(layer => layer.id === contextMenu.layerId)?.visible ? 
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-eye-off mr-2">
                <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>
                <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
                <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>
                <path d="m2 2 20 20"/>
              </svg> : 
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-eye mr-2">
                <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            }
            Toggle Visibility
          </button>
          <button
            className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              copyLayer(contextMenu.layerId);
              setContextMenu({});
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy mr-2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            Copy Layer
          </button>
          <button
            className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              duplicateLayer(contextMenu.layerId);
              setContextMenu({});
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layers2-icon lucide-layers-2 mr-2"><path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z"/><path d="m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845"/></svg>
            Duplicate Layer
          </button>
          <button
            className="flex items-center w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-100"
            onClick={() => {
              deleteLayer(contextMenu.layerId);
              setContextMenu({});
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash mr-2"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete Layer
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileUpload(Array.from(e.target.files))}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<CanvasEditor />);