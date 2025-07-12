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
    console.log("Current layers:", layers);
  }, [layers]);

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
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    
    if (tool === 'move') {
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
    const snapThreshold = 10 / viewport.scale;
    const gridSize = 50;

    if (isDragging && tool === 'move') {
        if (selectedLayer) {
            let newX = canvasPos.x - dragStart.x;
            let newY = canvasPos.y - dragStart.y;
            const currentLayer = layers.find(l => l.id === selectedLayer);
            
            if (currentLayer) {
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
    }
}, [isDragging, tool, selectedLayer, dragStart, cropMode, screenToCanvas, viewport.scale, layers]);

  const handleMouseUp = useCallback(() => {
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
  }, [isDragging, tool, selectedLayer, cropMode, cropStart, cropEnd, layers, saveToHistory, addLayer, createHoleInLayer]);

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
    
    layers.forEach(layer => {
      if (layer.visible) {
        ctx.drawImage(layer.image, layer.x, layer.y, layer.width, layer.height);
        
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
  }, [layers, selectedLayer, viewport, cropMode, cropStart, cropEnd]);

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

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

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