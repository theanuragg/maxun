import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { Accordion, AccordionSummary, AccordionDetails, Typography, Box, TextField, CircularProgress, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalInfoStore } from "../../context/globalInfo";
import { getStoredRuns } from "../../api/storage";
import { RunSettings } from "./RunSettings";
import { CollapsibleRow } from "./ColapsibleRow";
import { ArrowDownward, ArrowUpward, UnfoldMore } from '@mui/icons-material';

// Enhanced column definitions with improved width constraints
export const columns: readonly Column[] = [
  { id: 'runStatus', label: 'Status', minWidth: 100, maxWidth: 120, flex: 0.5 },
  { id: 'name', label: 'Name', minWidth: 150, flex: 1.5 },
  { id: 'startedAt', label: 'Started At', minWidth: 130, flex: 1 },
  { id: 'finishedAt', label: 'Finished At', minWidth: 130, flex: 1 },
  { id: 'settings', label: 'Settings', minWidth: 100, maxWidth: 120, flex: 0.5 },
  { id: 'delete', label: 'Delete', minWidth: 80, maxWidth: 100, flex: 0.5 },
];

type SortDirection = 'asc' | 'desc' | 'none';

interface AccordionSortConfig {
  [robotMetaId: string]: {
    field: keyof Data | null;
    direction: SortDirection;
  };
}

interface Column {
  id: 'runStatus' | 'name' | 'startedAt' | 'finishedAt' | 'delete' | 'settings';
  label: string;
  minWidth?: number;
  maxWidth?: number;
  flex?: number;
  align?: 'right';
  format?: (value: string) => string;
}

export interface Data {
  id: number;
  status: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  runByUserId?: string;
  runByScheduleId?: string;
  runByAPI?: boolean;
  log: string;
  runId: string;
  robotId: string;
  robotMetaId: string;
  interpreterSettings: RunSettings;
  serializableOutput: any;
  binaryOutput: any;
}

interface RunsTableProps {
  currentInterpretationLog: string;
  abortRunHandler: () => void;
  runId: string;
  runningRecordingName: string;
}

interface PaginationState {
  [robotMetaId: string]: {
    page: number;
    rowsPerPage: number;
  };
}

export const RunsTable: React.FC<RunsTableProps> = ({
  currentInterpretationLog,
  abortRunHandler,
  runId,
  runningRecordingName
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  const getUrlParams = () => {
    const match = location.pathname.match(/\/runs\/([^\/]+)(?:\/run\/([^\/]+))?/);
    return {
      robotMetaId: match?.[1] || null,
      urlRunId: match?.[2] || null
    };
  };

  const { robotMetaId: urlRobotMetaId, urlRunId } = getUrlParams();

  const isAccordionExpanded = useCallback((currentRobotMetaId: string) => {
    return currentRobotMetaId === urlRobotMetaId;
  }, [urlRobotMetaId]);

  const [accordionPage, setAccordionPage] = useState(0);
  const [accordionsPerPage, setAccordionsPerPage] = useState(10);
  const [accordionSortConfigs, setAccordionSortConfigs] = useState<AccordionSortConfig>({});

  const handleSort = useCallback((columnId: keyof Data, robotMetaId: string) => {
    setAccordionSortConfigs(prevConfigs => {
      const currentConfig = prevConfigs[robotMetaId] || { field: null, direction: 'none' };
      const newDirection: SortDirection = 
        currentConfig.field !== columnId ? 'asc' :
        currentConfig.direction === 'none' ? 'asc' :
        currentConfig.direction === 'asc' ? 'desc' : 'none';

      return {
        ...prevConfigs,
        [robotMetaId]: {
          field: newDirection === 'none' ? null : columnId,
          direction: newDirection,
        }
      };
    });
  }, []);

  // Responsive column adjustments based on screen size
  const responsiveColumns = useMemo(() => {
    let adjustedColumns = [...columns];
    
    if (isMobile) {
      // Show only essential columns on mobile
      adjustedColumns = columns.filter(col => 
        ['runStatus', 'name', 'startedAt'].includes(col.id)
      );
    } else if (isTablet) {
      // Adjust column widths for tablet
      adjustedColumns = columns.map(col => ({
        ...col,
        minWidth: col.minWidth ? Math.max(col.minWidth * 0.8, 70) : undefined,
        flex: col.flex ? col.flex * 0.9 : undefined
      }));
    }
    
    return adjustedColumns.map(column => ({
      ...column,
      label: t(`runstable.${column.id}`, column.label)
    }));
  }, [t, isMobile, isTablet]);

  const [rows, setRows] = useState<Data[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [paginationStates, setPaginationStates] = useState<PaginationState>({});

  const { notify, rerenderRuns, setRerenderRuns } = useGlobalInfoStore();

  const handleAccordionChange = useCallback((robotMetaId: string, isExpanded: boolean) => {
    navigate(isExpanded ? `/runs/${robotMetaId}` : '/runs');
  }, [navigate]);

  const handleAccordionPageChange = useCallback((event: unknown, newPage: number) => {
    setAccordionPage(newPage);
  }, []);
  
  const handleAccordionsPerPageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAccordionsPerPage(+event.target.value);
    setAccordionPage(0); 
  }, []);

  const handleChangePage = useCallback((robotMetaId: string, newPage: number) => {
    setPaginationStates(prev => ({
      ...prev,
      [robotMetaId]: {
        ...prev[robotMetaId],
        page: newPage
      }
    }));
  }, []);

  const handleChangeRowsPerPage = useCallback((robotMetaId: string, newRowsPerPage: number) => {
    setPaginationStates(prev => ({
      ...prev,
      [robotMetaId]: {
        page: 0, // Reset to first page when changing rows per page
        rowsPerPage: newRowsPerPage
      }
    }));
  }, []);

  const getPaginationState = useCallback((robotMetaId: string) => {
    const defaultState = { page: 0, rowsPerPage: 10 };
    
    if (!paginationStates[robotMetaId]) {
      setTimeout(() => {
        setPaginationStates(prev => ({
          ...prev,
          [robotMetaId]: defaultState
        }));
      }, 0);
      return defaultState;
    }
    return paginationStates[robotMetaId];
  }, [paginationStates]);

  const debouncedSearch = useCallback((fn: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }, []);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const debouncedSetSearch = debouncedSearch((value: string) => {
      setSearchTerm(value);
      setAccordionPage(0);
      setPaginationStates(prev => {
        const reset = Object.keys(prev).reduce((acc, robotId) => ({
          ...acc,
          [robotId]: { ...prev[robotId], page: 0 }
        }), {});
        return reset;
      });
    }, 300);
    debouncedSetSearch(event.target.value);
  }, [debouncedSearch]);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const runs = await getStoredRuns();
      if (runs) {
        const parsedRows: Data[] = runs.map((run: any, index: number) => ({
          id: index,
          ...run,
        }));
        setRows(parsedRows);
      } else {
        notify('error', t('runstable.notifications.no_runs'));
      }
    } catch (error) {
      notify('error', t('runstable.notifications.fetch_error'));
    } finally {
      setIsLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    let mounted = true;

    if (rows.length === 0 || rerenderRuns) {
      fetchRuns().then(() => {
        if (mounted) {
          setRerenderRuns(false);
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [rerenderRuns, rows.length, setRerenderRuns, fetchRuns]);

  const handleDelete = useCallback(() => {
    setRows([]);
    notify('success', t('runstable.notifications.delete_success'));
    fetchRuns();
  }, [notify, t, fetchRuns]);

  // Filter rows based on search term
  const filteredRows = useMemo(() => {
    let result = rows.filter((row) =>
      row.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return result;
  }, [rows, searchTerm]);

  const parseDateString = (dateStr: string): Date => {
    try {
      if (dateStr.includes('PM') || dateStr.includes('AM')) {
        return new Date(dateStr);
      }
      
      return new Date(dateStr.replace(/(\d+)\/(\d+)\//, '$2/$1/'))
    } catch {
      return new Date(0);
    }
  };

  const groupedRows = useMemo(() => {
    const groupedData = filteredRows.reduce((acc, row) => {
      if (!acc[row.robotMetaId]) {
        acc[row.robotMetaId] = [];
      }
      acc[row.robotMetaId].push(row);
      return acc;
    }, {} as Record<string, Data[]>);
  
    Object.keys(groupedData).forEach(robotId => {
      groupedData[robotId].sort((a, b) => 
        parseDateString(b.startedAt).getTime() - parseDateString(a.startedAt).getTime()
      );
    });
  
    const robotEntries = Object.entries(groupedData).map(([robotId, runs]) => ({
      robotId,
      runs,
      latestRunDate: parseDateString(runs[0].startedAt).getTime()
    }));
  
    robotEntries.sort((a, b) => b.latestRunDate - a.latestRunDate);
  
    return robotEntries.reduce((acc, { robotId, runs }) => {
      acc[robotId] = runs;
      return acc;
    }, {} as Record<string, Data[]>);
  }, [filteredRows]);

  const renderTableRows = useCallback((data: Data[], robotMetaId: string) => {
    const { page, rowsPerPage } = getPaginationState(robotMetaId);
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;

    let sortedData = [...data];
    const sortConfig = accordionSortConfigs[robotMetaId];
    
    if (sortConfig?.field === 'startedAt' || sortConfig?.field === 'finishedAt') {
      if (sortConfig.direction !== 'none') {
        sortedData.sort((a, b) => {
          const dateA = parseDateString(a[sortConfig.field!]);
          const dateB = parseDateString(b[sortConfig.field!]);
          
          return sortConfig.direction === 'asc' 
            ? dateA.getTime() - dateB.getTime() 
            : dateB.getTime() - dateA.getTime();
        });
      }
    }
    
    return sortedData
      .slice(start, end)
      .map((row) => (
        <CollapsibleRow
          key={`row-${row.id}`}
          row={row}
          handleDelete={handleDelete}
          isOpen={urlRunId === row.runId || (runId === row.runId && runningRecordingName === row.name)}
          currentLog={currentInterpretationLog}
          abortRunHandler={abortRunHandler}
          runningRecordingName={runningRecordingName}
          urlRunId={urlRunId}
        />
      ));
  }, [paginationStates, runId, runningRecordingName, currentInterpretationLog, abortRunHandler, handleDelete, accordionSortConfigs]);

  const renderSortIcon = useCallback((column: Column, robotMetaId: string) => {
    const sortConfig = accordionSortConfigs[robotMetaId];
    if (column.id !== 'startedAt' && column.id !== 'finishedAt') return null;

    if (sortConfig?.field !== column.id) {
      return (
        <UnfoldMore 
          fontSize="small" 
          sx={{ 
            opacity: 0.3,
            transition: 'opacity 0.2s',
            '.MuiTableCell-root:hover &': {
              opacity: 1
            }
          }} 
        />
      );
    }

    return sortConfig.direction === 'asc' 
      ? <ArrowUpward fontSize="small" />
      : sortConfig.direction === 'desc'
        ? <ArrowDownward fontSize="small" />
        : <UnfoldMore fontSize="small" />;
  }, [accordionSortConfigs]);

  // Calculate the appropriate table height based on viewport size
  const tableHeight = useMemo(() => {
    const baseHeight = 400;
    if (isMobile) return baseHeight * 0.7;
    if (isTablet) return baseHeight * 0.85;
    return baseHeight;
  }, [isMobile, isTablet]);

  return (
    <React.Fragment>
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems="center" 
        mb={2}
        flexDirection={isMobile ? "column" : "row"}
        gap={isMobile ? 2 : 0}
      >
        <Typography variant="h6" component="h2">
          {t('runstable.runs', 'Runs')}
        </Typography>
        <TextField
          size="small"
          placeholder={t('runstable.search', 'Search runs...')}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
          }}
          sx={{ width: isMobile ? '100%' : '250px' }}
        />
      </Box>

      {isLoading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper 
          elevation={3}
          sx={{ 
            width: '100%', 
            overflow: 'hidden',
            borderRadius: 1,
            transition: 'all 0.3s ease'
          }}
        >
          {Object.entries(groupedRows)
            .slice(
              accordionPage * accordionsPerPage,
              accordionPage * accordionsPerPage + accordionsPerPage
            )
            .map(([robotMetaId, data]) => (
              <Accordion 
                key={robotMetaId} 
                onChange={(event, isExpanded) => handleAccordionChange(robotMetaId, isExpanded)}
                TransitionProps={{ 
                  unmountOnExit: true,
                  timeout: 300
                }}
                sx={{
                  '&:before': {
                    display: 'none', // Remove accordion line
                  },
                  boxShadow: 'none',
                  '& .MuiAccordionSummary-root': {
                    minHeight: 64,
                    padding: theme.spacing(0, 2),
                    transition: 'all 0.2s',
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)'
                    }
                  },
                  '& .MuiAccordionDetails-root': {
                    padding: theme.spacing(1),
                  }
                }}
              >
                <AccordionSummary 
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls={`panel-${robotMetaId}-content`}
                  id={`panel-${robotMetaId}-header`}
                >
                  <Typography variant="h6">{data[data.length - 1].name}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer 
                    sx={{ 
                      maxHeight: tableHeight,
                      transition: 'max-height 0.3s ease'
                    }}
                  >
                    <Table 
                      stickyHeader 
                      aria-label="sticky table"
                      sx={{
                        tableLayout: "fixed", // Important for column sizing
                        "& .MuiTableCell-root": {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          transition: 'width 0.3s ease'
                        }
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell 
                            sx={{ 
                              width: 48, 
                              minWidth: 48, 
                              padding: theme.spacing(1, 0, 1, 1) 
                            }} 
                          />
                          {responsiveColumns.map((column) => (
                            <TableCell
                              key={column.id}
                              align={column.align}
                              sx={{ 
                                minWidth: column.minWidth,
                                maxWidth: column.maxWidth,
                                width: column.flex ? `${column.flex * 100}%` : 'auto',
                                cursor: column.id === 'startedAt' || column.id === 'finishedAt' ? 'pointer' : 'default',
                                padding: isMobile ? theme.spacing(1) : undefined,
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => {
                                if (column.id === 'startedAt' || column.id === 'finishedAt') {
                                  handleSort(column.id, robotMetaId);
                                }
                              }}
                            >
                              <Tooltip 
                                title={
                                  (column.id === 'startedAt' || column.id === 'finishedAt')
                                    ? t('runstable.sort_tooltip')
                                    : ''
                                }
                              >
                                <Box sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 1,
                                  '&:hover': {
                                    '& .sort-icon': {
                                      opacity: 1
                                    }
                                  }
                                }}>
                                  {column.label}
                                  <Box className="sort-icon" sx={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    opacity: accordionSortConfigs[robotMetaId]?.field === column.id ? 1 : 0.3,
                                    transition: 'opacity 0.2s'
                                  }}>
                                    {renderSortIcon(column, robotMetaId)}
                                  </Box>
                                </Box>
                              </Tooltip>
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {renderTableRows(data, robotMetaId)}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <TablePagination
                    component="div"
                    count={data.length}
                    rowsPerPage={getPaginationState(robotMetaId).rowsPerPage}
                    page={getPaginationState(robotMetaId).page}
                    onPageChange={(_, newPage) => handleChangePage(robotMetaId, newPage)}
                    onRowsPerPageChange={(event) => 
                      handleChangeRowsPerPage(robotMetaId, +event.target.value)
                    }
                    rowsPerPageOptions={[10, 25, 50, 100]}
                    labelRowsPerPage={isMobile ? "" : t('runstable.rows_per_page')}
                    sx={{
                      '.MuiTablePagination-selectLabel': {
                        display: isMobile ? 'none' : 'block'
                      },
                      '.MuiTablePagination-displayedRows': {
                        margin: isMobile ? '0 auto' : undefined
                      }
                    }}
                  />
                </AccordionDetails>
              </Accordion>
            ))}

          <TablePagination
            component="div"
            count={Object.keys(groupedRows).length}
            page={accordionPage}
            rowsPerPage={accordionsPerPage}
            onPageChange={handleAccordionPageChange}
            onRowsPerPageChange={handleAccordionsPerPageChange}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage={isMobile ? "" : t('runstable.accordions_per_page', 'Robots per page')}
            sx={{
              '.MuiTablePagination-selectLabel': {
                display: isMobile ? 'none' : 'block'
              },
              '.MuiTablePagination-displayedRows': {
                margin: isMobile ? '0 auto' : undefined
              }
            }}
          />
        </Paper>
      )}
    </React.Fragment>
  );
};