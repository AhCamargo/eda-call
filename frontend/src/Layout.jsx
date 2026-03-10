import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Toolbar,
  Typography,
  alpha,
  useMediaQuery,
  useTheme
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import CallIcon from '@mui/icons-material/Call';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PersonIcon from '@mui/icons-material/Person';
import DialpadIcon from '@mui/icons-material/Dialpad';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import InsightsIcon from '@mui/icons-material/Insights';
import { useTranslation } from 'react-i18next';

const drawerWidth = 240;

function Layout() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [drawerOpen, setDrawerOpen] = useState(isDesktop);

  useEffect(() => {
    setDrawerOpen(isDesktop);
  }, [isDesktop]);

  const primaryItems = [
    { to: '/', label: t('menu.dashboard'), icon: <DashboardIcon sx={{ color: 'primary.main' }} /> },
    { to: '/ramais', label: t('menu.extensions'), icon: <SupportAgentIcon sx={{ color: 'secondary.main' }} /> },
    { to: '/linhas-voip', label: t('menu.voipLines'), icon: <CallIcon sx={{ color: 'info.main' }} /> },
    { to: '/relatorios', label: t('menu.reports'), icon: <AssessmentIcon sx={{ color: 'warning.main' }} /> },
    { to: '/usuario', label: t('menu.user'), icon: <PersonIcon sx={{ color: 'action.active' }} /> }
  ];

  const campaignItems = [
    { to: '/campanhas/discador', label: t('menu.campaignsDialer'), icon: <DialpadIcon sx={{ color: 'error.main' }} /> },
    { to: '/campanhas/ura-reversa', label: t('menu.campaignsReverseIvr'), icon: <RecordVoiceOverIcon sx={{ color: 'success.main' }} /> },
    { to: '/campanhas/ura-reversa/relatorios', label: t('menu.campaignsReverseIvrReports'), icon: <InsightsIcon sx={{ color: 'primary.main' }} /> }
  ];

  const toggleDrawer = () => {
    setDrawerOpen((prev) => !prev);
  };

  const closeMobileDrawer = () => {
    if (!isDesktop) {
      setDrawerOpen(false);
    }
  };

  const onChangeLanguage = (nextLanguage) => {
    localStorage.setItem('language', nextLanguage);
    i18n.changeLanguage(nextLanguage);
  };

  const drawerContent = useMemo(
    () => (
      <>
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1 }}>
          <List>
            {primaryItems.map((item) => (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
                onClick={closeMobileDrawer}
                sx={{
                  borderRadius: 1.5,
                  mx: 1,
                  mb: 0.5,
                  color: 'common.white',
                  transition: 'all 0.2s ease',
                  '& .MuiListItemText-primary': {
                    fontWeight: 500
                  },
                  '& .MuiListItemIcon-root': {
                    minWidth: 38
                  },
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.28)} inset`
                  },
                  '&.active': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                    boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.5)} inset, 0 0 10px ${alpha(theme.palette.primary.main, 0.24)}`
                  }
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}

            <Divider sx={{ my: 1 }} />
            <ListItemText
              sx={{
                px: 2,
                pt: 1,
                pb: 1,
                '& .MuiTypography-root': {
                  color: alpha(theme.palette.common.white, 0.72),
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase'
                }
              }}
              primary={t('menu.campaigns')}
            />

            {campaignItems.map((item) => (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
                onClick={closeMobileDrawer}
                sx={{
                  pl: 3,
                  borderRadius: 1.5,
                  mx: 1,
                  mb: 0.5,
                  color: 'common.white',
                  transition: 'all 0.2s ease',
                  '& .MuiListItemText-primary': {
                    fontWeight: 500
                  },
                  '& .MuiListItemIcon-root': {
                    minWidth: 38
                  },
                  '&:hover': {
                    bgcolor: alpha(theme.palette.secondary.main, 0.16),
                    boxShadow: `0 0 0 1px ${alpha(theme.palette.secondary.main, 0.28)} inset`
                  },
                  '&.active': {
                    bgcolor: alpha(theme.palette.secondary.main, 0.22),
                    boxShadow: `0 0 0 1px ${alpha(theme.palette.secondary.main, 0.52)} inset, 0 0 10px ${alpha(theme.palette.secondary.main, 0.24)}`
                  }
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </>
    ),
    [primaryItems, campaignItems, t, isDesktop, theme]
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          background: `linear-gradient(90deg, ${alpha(theme.palette.primary.dark, 0.9)} 0%, ${alpha(theme.palette.primary.main, 0.88)} 55%, ${alpha(theme.palette.secondary.main, 0.76)} 100%)`,
          borderBottom: `1px solid ${alpha(theme.palette.primary.light, 0.35)}`,
          boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.24)}`,
          width: isDesktop && drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%',
          ml: isDesktop && drawerOpen ? `${drawerWidth}px` : 0
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={toggleDrawer}
            sx={{
              mr: 1,
              border: `1px solid ${alpha(theme.palette.common.white, 0.5)}`,
              bgcolor: alpha(theme.palette.common.white, 0.1),
              boxShadow: `0 0 8px ${alpha(theme.palette.primary.light, 0.24)}`,
              '&:hover': {
                bgcolor: alpha(theme.palette.common.white, 0.2),
                boxShadow: `0 0 10px ${alpha(theme.palette.primary.light, 0.32)}`
              }
            }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              color: 'common.white',
              fontWeight: 600,
              textShadow: `0 0 6px ${alpha(theme.palette.common.white, 0.38)}`
            }}
          >
            {t('appName')}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <FormControl
            size="small"
            sx={{
              minWidth: 160,
              bgcolor: alpha(theme.palette.common.white, 0.95),
              borderRadius: 1,
              boxShadow: `0 0 8px ${alpha(theme.palette.primary.light, 0.22)}`,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(theme.palette.primary.main, 0.45)
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(theme.palette.primary.main, 0.7)
              },
              '& .MuiSvgIcon-root': {
                color: theme.palette.primary.main
              }
            }}
          >
            <Select
              value={i18n.language}
              onChange={(e) => onChangeLanguage(e.target.value)}
              sx={{
                color: theme.palette.text.primary,
                fontWeight: 500
              }}
            >
              <MenuItem value="pt-BR">Português (BR)</MenuItem>
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="es">Español</MenuItem>
            </Select>
          </FormControl>
        </Toolbar>
      </AppBar>

      {isDesktop ? (
        <Drawer
          variant="persistent"
          open={drawerOpen}
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: drawerWidth,
              boxSizing: 'border-box',
              bgcolor: alpha(theme.palette.common.black, 0.9),
              borderRight: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`
            }
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={drawerOpen}
          onClose={toggleDrawer}
          ModalProps={{ keepMounted: true }}
          sx={{
            [`& .MuiDrawer-paper`]: {
              width: drawerWidth,
              boxSizing: 'border-box',
              bgcolor: alpha(theme.palette.common.black, 0.94),
              borderRight: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`
            }
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: 3, transition: 'all 0.2s ease' }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default Layout;
