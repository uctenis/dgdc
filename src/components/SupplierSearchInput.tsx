import React, { useState, useRef, useEffect } from 'react';
import { Search, Building2, Check, X, ChevronDown } from 'lucide-react';
import type { Proveedor } from '../types';

interface SupplierSearchInputProps {
  proveedores: Proveedor[];
  selectedProveedorId: string;
  onSelectProveedor: (proveedorId: string) => void;
  placeholder?: string;
}

export const SupplierSearchInput: React.FC<SupplierSearchInputProps> = ({
  proveedores,
  selectedProveedorId,
  onSelectProveedor,
  placeholder = 'Buscar empresa por RUT o Razón Social...',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProveedor = proveedores.find(p => p.id === selectedProveedorId);

  // Filtrado ultra-rápido por RUT (limpio) o Nombre/Razón Social
  const filteredProveedores = proveedores.filter(p => {
    if (!query.trim()) return true;
    const cleanQ = query.toLowerCase().trim();
    const cleanQDigits = cleanQ.replace(/[^0-9kK]/g, '');
    const cleanRutDigits = p.rut.replace(/[^0-9kK]/g, '').toLowerCase();

    const matchName = p.razonSocial.toLowerCase().includes(cleanQ);
    const matchRut = p.rut.toLowerCase().includes(cleanQ) || (cleanQDigits.length >= 3 && cleanRutDigits.includes(cleanQDigits));
    const matchRubro = p.rubro.toLowerCase().includes(cleanQ);

    return matchName || matchRut || matchRubro;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full text-xs">
      {selectedProveedor ? (
        <div className="flex items-center justify-between bg-sky-50 border border-sky-300 rounded-xl px-3 py-2 text-sky-950 font-semibold shadow-sm">
          <div className="flex items-center gap-2 truncate">
            <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
            <div className="truncate">
              <span className="font-bold text-slate-900 block truncate">{selectedProveedor.razonSocial}</span>
              <span className="text-[10px] text-sky-700 block">RUT: {selectedProveedor.rut} • {selectedProveedor.rubro}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectProveedor('');
              setQuery('');
              setIsOpen(true);
            }}
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-sky-100 rounded-lg transition shrink-0"
            title="Cambiar proveedor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-slate-800 font-medium placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Menú desplegable con resultados de búsqueda instantáneos */}
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
              {filteredProveedores.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs">
                  No se encontraron empresas contratistas que coincidan con "{query}".
                </div>
              ) : (
                filteredProveedores.map(prov => (
                  <div
                    key={prov.id}
                    onClick={() => {
                      onSelectProveedor(prov.id);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className="p-2.5 hover:bg-sky-50 cursor-pointer transition flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-800 text-xs group-hover:text-sky-900 truncate">
                        {prov.razonSocial}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono bg-slate-100 group-hover:bg-sky-100 px-1.5 py-0.5 rounded font-bold text-slate-700">
                          {prov.rut}
                        </span>
                        <span className="truncate">{prov.rubro}</span>
                      </div>
                    </div>
                    {prov.id === selectedProveedorId && (
                      <Check className="w-4 h-4 text-sky-600 shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
